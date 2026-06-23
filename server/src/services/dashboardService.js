import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupMeta, treasuryMetricConfigs } from "../config/series.js";
import { createDatabase } from "../db/database.js";
import { buildMetricAlerts, buildRegimeAlerts } from "./alertService.js";
import { buildAiOverlayStatus, refreshAiOverlay, refreshNewsDigest } from "./deepseekService.js";
import { fetchFredMetrics } from "./fredService.js";
import { fetchMacroNews } from "./newsService.js";
import { buildPublishingStatus, publishDailyBrief } from "./notionService.js";
import { buildDashboardOverview } from "./overviewService.js";
import {
  buildMetricFreshnessWarning,
  deriveDisplaySignal,
  formatMetricAsOf,
  formatMetricValue,
  isMetricStale,
  serializeMetricForTable,
} from "./presentationService.js";
import { deriveRegime } from "./regimeEngine.js";
import { buildReleaseSummary, fetchReleaseEvents } from "./releasesService.js";
import { fetchTreasuryMetrics } from "./treasuryService.js";
import { formatInTimeZone } from "../utils/time.js";
import { annotateCachedDashboard, readDashboardCache, writeDashboardCache } from "../utils/dashboardCache.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const defaultDbPath = path.join(rootDir, "data", "macro-dashboard.sqlite");
const defaultCachePath = path.join(rootDir, "data", "render-cache.json");
const refreshStateKey = "last_refresh_completed_at";
const metricDefinitionVersionKey = "metric_definition_version";
const metricDefinitionVersion = "2026-06-07-cpi-nsa";
const newsSnapshotStateKey = "macro_news_snapshot";
const newsDigestStateKey = "deepseek-news:last";

function buildSourceFetchFailure(name, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return `${name}: ${detail}`;
}

function buildSourceFetchError(failures) {
  return new Error(`Live source fetch failed: ${failures.join(" | ")}`);
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildSections(metricList) {
  return Object.entries(groupMeta).map(([groupKey, meta]) => {
    const metrics = metricList.filter((metric) => metric.group === groupKey).map(serializeMetricForTable);
    return {
      key: groupKey,
      title: meta.title,
      lead: meta.lead,
      perspective: meta.perspective,
      metrics,
    };
  });
}

function buildTopSignals(metricList) {
  return metricList
    .filter((metric) => metric.latest)
    .sort((a, b) => {
      const weight = { high: 0, medium: 1, low: 2 };
      return (weight[a.importance] ?? 9) - (weight[b.importance] ?? 9);
    })
    .slice(0, 6)
    .map((metric) => ({
      key: metric.key,
      label: metric.label,
      valueText: formatMetricValue(metric),
      marketSignal: deriveDisplaySignal(metric),
      date: formatMetricAsOf(metric),
    }));
}

function buildSourceStatus(parts, aiOverlay) {
  return {
    fred: parts.fred.sourceStatus,
    treasury: parts.treasury.sourceStatus,
    releases: parts.releases.sourceStatus,
    news: parts.news.sourceStatus,
    ai: aiOverlay.configured ? aiOverlay.status : "disabled",
  };
}

function buildConfigStatus(env) {
  return {
    fredConfigured: Boolean(env.FRED_API_KEY),
    notionConfigured: Boolean(env.NOTION_API_KEY && env.NOTION_DATA_SOURCE_ID),
    deepseekConfigured: Boolean(env.DEEPSEEK_API_KEY),
  };
}

function buildWarnings(parts) {
  return [...parts.fred.warnings, ...parts.treasury.warnings, ...parts.releases.warnings, ...parts.news.warnings];
}

function buildFreshnessWarnings(metrics) {
  return metrics.map(buildMetricFreshnessWarning).filter(Boolean);
}

function hasRenderableSectionCoverage(metrics) {
  const groupCounts = new Map(metrics.map((metric) => [metric.group, 0]));
  for (const metric of metrics) {
    groupCounts.set(metric.group, (groupCounts.get(metric.group) ?? 0) + 1);
  }

  return Object.keys(groupMeta).every((groupKey) => (groupCounts.get(groupKey) ?? 0) > 0);
}

function hasCriticalFredCoverage(metrics) {
  const groups = new Set(metrics.map((metric) => metric.group));
  return groups.has("growthLabor") && groups.has("inflationFed");
}

function buildFredCoverageError(fred) {
  const detail = fred.warnings?.[0] ? ` First FRED warning: ${fred.warnings[0]}` : "";
  return new Error(`FRED refresh did not produce growth/inflation coverage.${detail}`);
}

function restoreMetricsFromDb(dbLatestMap, historyMap) {
  return Object.values(dbLatestMap).map((latestMetric) => ({
    ...latestMetric,
    sourceLabel: latestMetric.sourceLabel ?? latestMetric.metadata.sourceLabel ?? latestMetric.source ?? "Cached",
    definition: latestMetric.definition ?? latestMetric.metadata.definition ?? "Level",
    latest: {
      date: latestMetric.date,
      value: latestMetric.value,
      rawValue: latestMetric.rawValue,
    },
    previous: historyMap.get(latestMetric.key)?.[1]
      ? {
          date: historyMap.get(latestMetric.key)[1].date,
          value: historyMap.get(latestMetric.key)[1].value,
        }
      : null,
    change:
      historyMap.get(latestMetric.key)?.[1] && Number.isFinite(historyMap.get(latestMetric.key)[0]?.value)
        ? Number((historyMap.get(latestMetric.key)[0].value - historyMap.get(latestMetric.key)[1].value).toFixed(2))
        : null,
    history: [...(historyMap.get(latestMetric.key) ?? [])].reverse(),
    marketSignal: deriveDisplaySignal({
      ...latestMetric,
      latest: {
        date: latestMetric.date,
        value: latestMetric.value,
        rawValue: latestMetric.rawValue,
      },
    }),
    importance: latestMetric.metadata.importance ?? "medium",
  }));
}

function maxCacheAgeMinutes(env) {
  const parsed = Number(env.DASHBOARD_REFRESH_INTERVAL_MINUTES ?? 180);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
}

function shouldAttemptAutoRefresh(metrics, lastRefreshIso, cachedVersion, env) {
  if (metrics.length === 0) {
    return true;
  }

  if (!hasRenderableSectionCoverage(metrics)) {
    return true;
  }

  if (cachedVersion !== metricDefinitionVersion) {
    return true;
  }

  if (metrics.some((metric) => isMetricStale(metric))) {
    return true;
  }

  if (!lastRefreshIso) {
    return true;
  }

  const lastRefresh = new Date(lastRefreshIso);
  if (Number.isNaN(lastRefresh.getTime())) {
    return true;
  }

  const ageMinutes = (Date.now() - lastRefresh.getTime()) / (60 * 1000);
  return ageMinutes >= maxCacheAgeMinutes(env);
}

function buildCachedNewsSnapshot(db) {
  const newsDigestSnapshot = parseJson(db.getState(newsDigestStateKey), null);
  if (newsDigestSnapshot?.snapshot) {
    return newsDigestSnapshot.snapshot;
  }

  return parseJson(db.getState(newsSnapshotStateKey), {
    us: { dataUpdates: [], news: [] },
    global: { dataUpdates: [], news: [] },
  });
}

function resolveDbPath(env) {
  if (env.DB_PATH) {
    return env.DB_PATH;
  }

  if (env.DATA_DIR) {
    return path.join(env.DATA_DIR, "macro-dashboard.sqlite");
  }

  return defaultDbPath;
}

function resolveCachePath(env) {
  if (env.DASHBOARD_CACHE_PATH) {
    return env.DASHBOARD_CACHE_PATH;
  }

  if (env.DATA_DIR) {
    return path.join(env.DATA_DIR, "render-cache.json");
  }

  return defaultCachePath;
}

function buildEmptyNewsSnapshot() {
  return {
    us: { dataUpdates: [], news: [] },
    global: { dataUpdates: [], news: [] },
    warnings: [],
    sourceStatus: "error",
  };
}

function restoreMetricSubsetFromDb(db, keys) {
  const latest = db.getLatestMetricMap();
  const historyMap = db.getMetricHistory();
  return restoreMetricsFromDb(latest, historyMap).filter((metric) => keys.includes(metric.key));
}

export function createDashboardService(env) {
  const db = createDatabase(resolveDbPath(env));
  const cachePath = resolveCachePath(env);
  let refreshInFlight = null;

  async function collectFreshData() {
    const timeZone = env.APP_TIMEZONE ?? "Asia/Shanghai";
    const coreSources = [
      ["fred", () => fetchFredMetrics(env.FRED_API_KEY)],
      ["treasury", () => fetchTreasuryMetrics(env.FRED_API_KEY)],
      ["releases", () => fetchReleaseEvents()],
    ];
    const coreSettled = await Promise.allSettled(coreSources.map(([, fetcher]) => fetcher()));
    const treasuryKeys = treasuryMetricConfigs.map((config) => config.key);
    const recoveredCoreResults = [];
    const coreFailures = [];

    for (const [index, result] of coreSettled.entries()) {
      const sourceName = coreSources[index][0];
      if (result.status === "fulfilled") {
        recoveredCoreResults[index] = result.value;
        continue;
      }

      if (sourceName === "treasury") {
        const cachedTreasuryMetrics = restoreMetricSubsetFromDb(db, treasuryKeys);
        if (cachedTreasuryMetrics.length === treasuryKeys.length) {
          recoveredCoreResults[index] = {
            metrics: cachedTreasuryMetrics,
            warnings: [
              `Treasury live fetch failed. Using cached rates block: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
            ],
            sourceStatus: "cached_fallback",
          };
          continue;
        }
      }

      if (sourceName === "releases") {
        const cachedEvents = db.getUpcomingReleases(60);
        if (cachedEvents.length) {
          recoveredCoreResults[index] = {
            events: cachedEvents,
            warnings: [
              `Release calendar live fetch failed. Using cached schedule: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
            ],
            sourceStatus: "cached_fallback",
          };
          continue;
        }
      }

      coreFailures.push(buildSourceFetchFailure(sourceName, result.reason));
    }

    if (coreFailures.length) {
      throw buildSourceFetchError(coreFailures);
    }

    const [fred, treasury, releases] = recoveredCoreResults;
    const newsResult = await Promise.allSettled([fetchMacroNews(timeZone)]);
    const newsFailure = newsResult[0].status === "rejected" ? buildSourceFetchFailure("news", newsResult[0].reason) : null;
    const rawNews = newsResult[0].status === "fulfilled" ? newsResult[0].value : buildEmptyNewsSnapshot();
    if (newsFailure) {
      rawNews.warnings = [...rawNews.warnings, newsFailure];
      rawNews.sourceStatus = "error";
    }
    const newsDigest = await refreshNewsDigest(env, db, { newsSnapshot: rawNews });
    const news = newsDigest.news;

    const metrics = [...fred.metrics, ...treasury.metrics];
    if (env.FRED_API_KEY && !hasCriticalFredCoverage(metrics)) {
      throw buildFredCoverageError(fred);
    }

    const previousLatest = db.getLatestMetricMap();
    const previousRegime = db.getLatestRegime();
    const metricMap = Object.fromEntries(metrics.map((metric) => [metric.key, metric]));
    const regimeState = deriveRegime(metricMap);

    db.saveMetricHistory(metrics);
    db.saveReleases(releases.events);
    db.saveRegime(regimeState);
    db.setState(refreshStateKey, new Date().toISOString());
    db.setState(metricDefinitionVersionKey, metricDefinitionVersion);
    db.setState(newsSnapshotStateKey, JSON.stringify(news));

    const alerts = [...buildMetricAlerts(previousLatest, metrics), ...buildRegimeAlerts(previousRegime, regimeState)];
    db.saveAlerts(alerts);

    const feed = db.getRecentAlerts(20);
    const sortedMetrics = metrics.filter((metric) => metric.latest).sort((a, b) => (a.group > b.group ? 1 : -1));
    const overview = buildDashboardOverview(sortedMetrics, regimeState, feed, news, timeZone);
    const topSignals = buildTopSignals(sortedMetrics);
    const aiOverlay = await refreshAiOverlay(env, db, {
      metrics: sortedMetrics,
      regimeState,
      overview,
      topSignals,
      timeZone,
    });

    return {
      metrics: sortedMetrics,
      regimeState,
      releases: releases.events,
      news,
      feed,
      overview,
      topSignals,
      aiOverlay,
      sources: {
        fred,
        treasury,
        releases,
        news: {
          ...rawNews,
          warnings: [
            ...rawNews.warnings,
            ...(newsDigest.error ? [`DeepSeek news digest: ${newsDigest.error}`] : []),
          ],
        },
      },
    };
  }

  function buildPayload(metrics, regimeState, releases, news, feed, overview, topSignals, aiOverlay, sources, warningPrefix = []) {
    const timeZone = env.APP_TIMEZONE ?? "Asia/Shanghai";
    const releasesSeven = buildReleaseSummary(releases, timeZone, 7);
    const releasesThirty = buildReleaseSummary(releases, timeZone, 30);

    const aiWarnings = aiOverlay?.error ? [`DeepSeek overlay: ${aiOverlay.error}`] : [];

    return {
      generatedAt: new Date().toISOString(),
      generatedAtLocal: formatInTimeZone(new Date(), timeZone),
      timeZone,
      headline: overview.headline,
      strategy: overview.strategy,
      monitor: overview.monitor,
      aiOverlay,
      regimeState,
      sourceStatus: buildSourceStatus(sources, aiOverlay),
      configStatus: buildConfigStatus(env),
      publishing: buildPublishingStatus(db, env, timeZone),
      warnings: [...warningPrefix, ...buildWarnings(sources), ...buildFreshnessWarnings(metrics), ...aiWarnings],
      topSignals,
      sections: buildSections(metrics),
      releases: {
        sevenDays: releasesSeven,
        thirtyDays: releasesThirty,
      },
      feed,
    };
  }

  function buildCachedPayload(extraWarnings = []) {
    const timeZone = env.APP_TIMEZONE ?? "Asia/Shanghai";
    const latest = db.getLatestMetricMap();
    const historyMap = db.getMetricHistory();
    const metrics = restoreMetricsFromDb(latest, historyMap).filter((metric) => metric.latest).sort((a, b) => (a.group > b.group ? 1 : -1));
    const regimeState = deriveRegime(Object.fromEntries(metrics.map((metric) => [metric.key, metric])));
    const releasesThirty = db.getUpcomingReleases(30);
    const news = buildCachedNewsSnapshot(db);
    const feed = db.getRecentAlerts(20);
    const overview = buildDashboardOverview(metrics, regimeState, feed, news, timeZone);
    const topSignals = buildTopSignals(metrics);
    const aiOverlay = buildAiOverlayStatus(db, env, timeZone);

    return buildPayload(
      metrics,
      regimeState,
      releasesThirty,
      news,
      feed,
      overview,
      topSignals,
      aiOverlay,
      {
        fred: { sourceStatus: env.FRED_API_KEY ? "cached" : "missing_api_key", warnings: [] },
        treasury: { sourceStatus: "cached", warnings: [] },
        releases: { sourceStatus: "cached", warnings: [] },
        news: { sourceStatus: "cached", warnings: [] },
      },
      extraWarnings,
    );
  }

  async function forceRefreshPayload() {
    if (!refreshInFlight) {
      refreshInFlight = collectFreshData().finally(() => {
        refreshInFlight = null;
      });
    }
    const fresh = await refreshInFlight;
    const payload = buildPayload(
      fresh.metrics,
      fresh.regimeState,
      fresh.releases,
      fresh.news,
      fresh.feed,
      fresh.overview,
      fresh.topSignals,
      fresh.aiOverlay,
      fresh.sources,
    );
    writeDashboardCache(cachePath, payload);
    return payload;
  }

  function buildCacheFilePayload(extraWarnings = []) {
    return annotateCachedDashboard(readDashboardCache(cachePath), extraWarnings);
  }

  async function loadDashboard(forceRefresh = false) {
    if (forceRefresh) {
      return forceRefreshPayload();
    }

    const latest = db.getLatestMetricMap();
    if (Object.keys(latest).length === 0) {
      try {
        return await forceRefreshPayload();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cachedPayload = buildCacheFilePayload([
          `Live refresh failed before rebuilding local state. Showing repository cache instead: ${message}`,
        ]);
        if (cachedPayload) {
          return cachedPayload;
        }
        throw error;
      }
    }

    const historyMap = db.getMetricHistory();
    const metrics = restoreMetricsFromDb(latest, historyMap);
    const lastRefreshIso = db.getState(refreshStateKey);
    const cachedVersion = db.getState(metricDefinitionVersionKey);

    if (shouldAttemptAutoRefresh(metrics, lastRefreshIso, cachedVersion, env)) {
      try {
        return await forceRefreshPayload();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const versionWarning =
          cachedVersion !== metricDefinitionVersion
            ? ["Cached data was produced under an older metric definition and needs a successful live refresh."]
            : [];
        const cachePayload = buildCacheFilePayload([
          ...versionWarning,
          `Live refresh failed. Showing repository cache instead: ${message}`,
        ]);
        if (cachePayload) {
          return cachePayload;
        }
        return buildCachedPayload([
          ...versionWarning,
          `Live refresh failed. Showing cached data instead: ${message}`,
        ]);
      }
    }

    return buildCachedPayload();
  }

  async function refreshAndNotify() {
    const payload = await loadDashboard(true);

    try {
      await publishDailyBrief(env, db, payload);
      payload.publishing = buildPublishingStatus(db, env, payload.timeZone);
    } catch (error) {
      payload.warnings = [
        ...payload.warnings,
        `Notion sync failed: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }

    writeDashboardCache(cachePath, payload);

    return payload;
  }

  async function maybePublishDailyBrief() {
    const dashboard = await loadDashboard(false);
    await publishDailyBrief(env, db, dashboard);
  }

  async function syncPublishing() {
    const dashboard = await loadDashboard(false);
    await publishDailyBrief(env, db, dashboard);
    const payload = {
      ...dashboard,
      publishing: buildPublishingStatus(db, env, dashboard.timeZone),
    };
    writeDashboardCache(cachePath, payload);
    return payload;
  }

  return {
    loadDashboard,
    refreshAndNotify,
    maybePublishDailyBrief,
    syncPublishing,
  };
}

export const __testables = {
  buildSourceFetchFailure,
  buildSourceFetchError,
  buildEmptyNewsSnapshot,
  hasRenderableSectionCoverage,
};

import { fredSeriesConfigs } from "../config/series.js";
import { fetchJson } from "../utils/http.js";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function limitForFrequency(frequency) {
  if (frequency === "daily") {
    return 800;
  }
  if (frequency === "weekly") {
    return 320;
  }
  if (frequency === "monthly") {
    return 240;
  }
  if (frequency === "quarterly") {
    return 120;
  }
  return 80;
}

function normalizeObservations(observations) {
  return observations
    .map((item) => ({
      date: item.date,
      value: toNumber(item.value),
    }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateDerivedSeries(config, observations) {
  const history = [];

  for (let index = 0; index < observations.length; index += 1) {
    const current = observations[index];
    let value = null;

    if (config.calculation === "last") {
      value = current.value;
    } else if (config.calculation === "lastScaled") {
      value = current.value * (config.scale ?? 1);
    } else if (config.calculation === "diff" && index > 0) {
      value = current.value - observations[index - 1].value;
    } else if (config.calculation === "yoyPct" && index >= 12) {
      const prior = observations[index - 12].value;
      value = prior === 0 ? null : ((current.value / prior) - 1) * 100;
    }

    if (Number.isFinite(value)) {
      history.push({
        date: current.date,
        value: round(value),
        rawValue: current.value,
      });
    }
  }

  const trimmedHistory = history.slice(-60);
  const latest = trimmedHistory.at(-1) ?? null;
  const previous = trimmedHistory.at(-2) ?? null;
  const change = latest && previous ? round(latest.value - previous.value) : null;

  return {
    history: trimmedHistory,
    latest,
    previous,
    change,
  };
}

function deriveMarketSignal(config, latestValue) {
  if (!Number.isFinite(latestValue)) {
    return "Unavailable";
  }

  switch (config.key) {
    case "retailSales":
      return latestValue >= 3 ? "Consumer demand remains resilient" : latestValue >= 0 ? "Consumer demand is cooling" : "Consumer demand is weakening";
    case "nonfarmPayrolls":
      return latestValue >= 175 ? "Hiring remains strong" : latestValue >= 75 ? "Hiring is cooling" : "Hiring is weakening";
    case "unemploymentRate":
      return latestValue <= 4.2 ? "Labor market remains tight" : latestValue <= 4.7 ? "Labor market is rebalancing" : "Unemployment pressure is rising";
    case "initialClaims":
      return latestValue <= 230 ? "Layoff pressure remains low" : latestValue <= 260 ? "Labor momentum is softening" : "Claims are flashing warning signs";
    case "ismManufacturing":
      return latestValue >= 2 ? "Factory activity is expanding" : latestValue >= 0 ? "Factory activity is stabilizing" : "Factory activity is contracting";
    case "cpi":
    case "coreCpi":
    case "pce":
    case "corePce":
    case "wageGrowth":
    case "coreServicesExHousing":
      return latestValue <= 2.5 ? "Inflation is close to target" : latestValue <= 3.5 ? "Inflation remains sticky" : "Inflation is running hot";
    case "creditSpread":
      return latestValue <= 1.4 ? "Credit conditions are easy" : latestValue <= 2 ? "Credit conditions are neutral" : "Credit conditions are tightening";
    case "dxyBroad":
      return latestValue >= 125 ? "Dollar is strong" : latestValue >= 117 ? "Dollar is firm" : "Dollar pressure is limited";
    default:
      return "Monitoring";
  }
}

function buildSeriesUrl(config, apiKey) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", config.seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limitForFrequency(config.frequency)));
  return url;
}

async function fetchSeries(config, apiKey) {
  const payload = await fetchJson(buildSeriesUrl(config, apiKey).toString());
  const observations = normalizeObservations(payload.observations ?? []);
  const calculated = calculateDerivedSeries(config, observations);
  const latestValue = calculated.latest?.value ?? null;

  return {
    key: config.key,
    label: config.label,
    source: "FRED",
    sourceLabel: config.sourceLabel,
    group: config.group,
    category: config.category,
    definition: config.definition,
    frequency: config.frequency,
    unit: config.unit,
    importance: config.importance,
    alertThreshold: config.alertThreshold,
    history: calculated.history,
    latest: calculated.latest,
    previous: calculated.previous,
    change: calculated.change,
    marketSignal: deriveMarketSignal(config, latestValue),
  };
}

export async function fetchFredMetrics(apiKey) {
  if (!apiKey) {
    return {
      metrics: [],
      warnings: ["Missing FRED_API_KEY. FRED series were not fetched."],
      sourceStatus: "missing_api_key",
    };
  }

  const settled = await Promise.allSettled(fredSeriesConfigs.map((config) => fetchSeries(config, apiKey)));
  const metrics = [];
  const warnings = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      metrics.push(result.value);
    } else {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  return {
    metrics,
    warnings,
    sourceStatus: warnings.length ? "partial" : "ok",
  };
}

export const __testables = {
  buildSeriesUrl,
  calculateDerivedSeries,
  limitForFrequency,
  normalizeObservations,
};

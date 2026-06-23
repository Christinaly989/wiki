import { XMLParser } from "fast-xml-parser";
import { treasuryMetricConfigs } from "../config/series.js";
import { fetchJson, fetchText } from "../utils/http.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true,
});

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function unwrapValue(value) {
  if (value && typeof value === "object" && "#text" in value) {
    return value["#text"];
  }
  return value;
}

const fredFallbackSeries = {
  treasury2y: "DGS2",
  treasury10y: "DGS10",
  treasury30y: "DGS30",
  real10y: "DFII10",
};

async function fetchTreasuryFeed(kind, year) {
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=${kind}&field_tdr_date_value=${year}`;
  const xml = await fetchText(url);
  const parsed = parser.parse(xml);
  const entries = Array.isArray(parsed.feed?.entry) ? parsed.feed.entry : [parsed.feed?.entry].filter(Boolean);

  return entries
    .map((entry) => entry.content?.properties)
    .filter(Boolean)
    .map((item) => {
      const normalized = {};
      for (const [key, value] of Object.entries(item)) {
        normalized[key] = unwrapValue(value);
      }
      return normalized;
    });
}

function createSeriesMetric(config, history, latestValue, change, signal, source = "Treasury", sourceLabel = config.sourceLabel) {
  return {
    key: config.key,
    label: config.label,
    source,
    sourceLabel,
    group: config.group,
    category: config.category,
    definition: config.definition,
    frequency: "daily",
    unit: config.unit,
    importance: config.importance,
    alertThreshold: config.alertThreshold,
    history,
    latest: history.at(-1) ? { date: history.at(-1).date, value: latestValue, rawValue: latestValue } : null,
    previous: history.at(-2) ? { date: history.at(-2).date, value: history.at(-2).value } : null,
    change,
    marketSignal: signal,
  };
}

function deriveTreasurySignal(configKey, latest) {
  if (!Number.isFinite(latest)) {
    return "Unavailable";
  }

  if (configKey === "curve2s10s") {
    return latest >= 0 ? "Curve has re-steepened" : latest >= -50 ? "Curve remains inverted" : "Curve remains deeply inverted";
  }

  if (configKey === "real10y") {
    return latest >= 2 ? "Real yields remain restrictive" : latest >= 1 ? "Real yields are neutral" : "Real yields are easing";
  }

  if (configKey === "treasury10y") {
    return latest >= 4.5 ? "Long-end valuation pressure is high" : latest >= 4 ? "Long-end yields remain elevated" : "Long-end yields are easing";
  }

  if (configKey === "breakeven10y") {
    return latest >= 2.5 ? "Inflation expectations are heating up" : latest >= 2 ? "Inflation expectations are stable" : "Inflation expectations are softening";
  }

  return "Monitoring";
}

function mergeTreasuryCurves(nominalMap, realMap) {
  const mergedDates = [...nominalMap.keys()].filter((date) => realMap.has(date)).sort();
  return mergedDates.map((date) => {
    const nominal = nominalMap.get(date);
    const real = realMap.get(date);
    const curve2s10s = (nominal.treasury10y - nominal.treasury2y) * 100;
    const breakeven10y = nominal.treasury10y - real.real10y;

    return {
      date,
      treasury2y: round(nominal.treasury2y),
      treasury10y: round(nominal.treasury10y),
      treasury30y: round(nominal.treasury30y),
      curve2s10s: round(curve2s10s),
      real10y: round(real.real10y),
      breakeven10y: round(breakeven10y),
    };
  });
}

function buildTreasuryMetricPayload(curves, source, sourceLabel) {
  const metrics = treasuryMetricConfigs.map((config) => {
    const history = curves.map((row) => ({
      date: row.date,
      value: row[config.key],
      rawValue: row[config.key],
    }));
    const latest = history.at(-1)?.value ?? null;
    const previous = history.at(-2)?.value ?? null;
    const change = Number.isFinite(latest) && Number.isFinite(previous) ? round(latest - previous) : null;

    return createSeriesMetric(config, history, latest, change, deriveTreasurySignal(config.key, latest), source, sourceLabel);
  });

  return metrics;
}

async function fetchTreasuryMetricsFromOfficial() {
  const years = [new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()];
  const nominalRows = (await Promise.all(years.map((year) => fetchTreasuryFeed("daily_treasury_yield_curve", year)))).flat();
  const realRows = (await Promise.all(years.map((year) => fetchTreasuryFeed("daily_treasury_real_yield_curve", year)))).flat();

  const nominalMap = new Map(
    nominalRows.map((row) => [
      row.NEW_DATE.slice(0, 10),
      {
        date: row.NEW_DATE.slice(0, 10),
        treasury2y: Number(row.BC_2YEAR),
        treasury10y: Number(row.BC_10YEAR),
        treasury30y: Number(row.BC_30YEAR ?? row.BC_30YEARDISPLAY),
      },
    ]),
  );

  const realMap = new Map(
    realRows.map((row) => [
      row.NEW_DATE.slice(0, 10),
      {
        date: row.NEW_DATE.slice(0, 10),
        real10y: Number(row.TC_10YEAR),
      },
    ]),
  );

  return mergeTreasuryCurves(nominalMap, realMap);
}

function normalizeFredObservations(observations) {
  return (observations ?? [])
    .map((item) => ({
      date: item.date,
      value: Number(item.value),
    }))
    .filter((item) => item.date && Number.isFinite(item.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchFredSeries(seriesId, apiKey) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "800");
  const payload = await fetchJson(url.toString());
  return normalizeFredObservations(payload.observations);
}

async function fetchTreasuryMetricsFromFred(apiKey) {
  const seriesEntries = await Promise.all(
    Object.entries(fredFallbackSeries).map(async ([key, seriesId]) => [key, await fetchFredSeries(seriesId, apiKey)]),
  );
  const seriesMap = new Map(seriesEntries);
  const nominal2y = seriesMap.get("treasury2y") ?? [];
  const nominal10y = seriesMap.get("treasury10y") ?? [];
  const nominal30y = seriesMap.get("treasury30y") ?? [];
  const real10y = seriesMap.get("real10y") ?? [];

  const nominalMap = new Map();
  for (const item of nominal2y) {
    nominalMap.set(item.date, {
      date: item.date,
      treasury2y: item.value,
    });
  }
  for (const item of nominal10y) {
    nominalMap.set(item.date, {
      ...(nominalMap.get(item.date) ?? { date: item.date }),
      treasury10y: item.value,
    });
  }
  for (const item of nominal30y) {
    nominalMap.set(item.date, {
      ...(nominalMap.get(item.date) ?? { date: item.date }),
      treasury30y: item.value,
    });
  }

  const filteredNominalMap = new Map(
    [...nominalMap.entries()].filter(([, value]) =>
      Number.isFinite(value.treasury2y) && Number.isFinite(value.treasury10y) && Number.isFinite(value.treasury30y),
    ),
  );
  const realMap = new Map(real10y.map((item) => [item.date, { date: item.date, real10y: item.value }]));
  return mergeTreasuryCurves(filteredNominalMap, realMap);
}

export async function fetchTreasuryMetrics(apiKey) {
  try {
    const curves = await fetchTreasuryMetricsFromOfficial();
    return {
      metrics: buildTreasuryMetricPayload(curves, "Treasury", "U.S. Treasury"),
      warnings: [],
      sourceStatus: "ok",
    };
  } catch (error) {
    if (!apiKey) {
      throw error;
    }

    const curves = await fetchTreasuryMetricsFromFred(apiKey);
    return {
      metrics: buildTreasuryMetricPayload(curves, "FRED", "U.S. Treasury via FRED fallback"),
      warnings: [
        `Treasury official feed failed, using FRED fallback: ${error instanceof Error ? error.message : String(error)}`,
      ],
      sourceStatus: "fallback_fred",
    };
  }
}

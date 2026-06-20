import { XMLParser } from "fast-xml-parser";
import { treasuryMetricConfigs } from "../config/series.js";
import { fetchText } from "../utils/http.js";

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

function createSeriesMetric(config, history, latestValue, change, signal) {
  return {
    key: config.key,
    label: config.label,
    source: "Treasury",
    sourceLabel: config.sourceLabel,
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

export async function fetchTreasuryMetrics() {
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

  const mergedDates = [...nominalMap.keys()].filter((date) => realMap.has(date)).sort();
  const curves = mergedDates.map((date) => {
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

  const metrics = treasuryMetricConfigs.map((config) => {
    const history = curves.map((row) => ({
      date: row.date,
      value: row[config.key],
      rawValue: row[config.key],
    }));
    const latest = history.at(-1)?.value ?? null;
    const previous = history.at(-2)?.value ?? null;
    const change = Number.isFinite(latest) && Number.isFinite(previous) ? round(latest - previous) : null;

    return createSeriesMetric(config, history, latest, change, deriveTreasurySignal(config.key, latest));
  });

  return {
    metrics,
    warnings: [],
    sourceStatus: "ok",
  };
}

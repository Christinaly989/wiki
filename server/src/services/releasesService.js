import * as cheerio from "cheerio";
import { fetchText } from "../utils/http.js";
import { addDays, formatInTimeZone, parseEasternDateTime, safeIso, withinDays } from "../utils/time.js";

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildEvent({ source, name, releaseDate, timeText = "08:30 AM", importance = "medium", impact, tags = [], relatedSeries = [], notes = "" }) {
  const utcDate = parseEasternDateTime(releaseDate, timeText);
  return {
    eventId: `${source}-${slugify(name)}-${safeIso(utcDate).slice(0, 10)}`,
    source,
    name,
    releaseAtUtc: utcDate.toISOString(),
    releaseAtLocal: formatInTimeZone(utcDate, "Asia/Shanghai"),
    importance,
    impact,
    tags,
    relatedSeries,
    notes,
    status: utcDate.getTime() < Date.now() ? "released" : "scheduled",
    metadata: {
      easternTime: timeText,
    },
  };
}

function parseTableRows(html) {
  const $ = cheerio.load(html);
  return $("table tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("th, td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .filter(Boolean),
    )
    .filter((row) => row.length >= 2);
}

async function fetchBlsSpecificSchedule(url, definition) {
  const html = await fetchText(url);
  const rows = parseTableRows(html);
  const events = [];

  for (const row of rows) {
    const joined = row.join(" | ");
    if (/Reference Month|Release Date|Release Time/i.test(joined)) {
      continue;
    }
    const [referencePeriod, releaseDate, releaseTime] = row;
    if (!releaseDate || !/\d{4}/.test(releaseDate)) {
      continue;
    }
    events.push(
      buildEvent({
        source: "BLS",
        name: definition.name,
        releaseDate,
        timeText: releaseTime ?? "08:30 AM",
        importance: definition.importance,
        impact: definition.impact,
        tags: definition.tags,
        relatedSeries: definition.relatedSeries,
        notes: referencePeriod,
      }),
    );
  }

  return events;
}

async function fetchBlsEvents() {
  const defs = [
    {
      url: "https://www.bls.gov/schedule/news_release/cpi.htm?lv=true",
      name: "Consumer Price Index",
      impact: "Inflation / Fed",
      importance: "high",
      tags: ["cpi", "inflation"],
      relatedSeries: ["cpi", "coreCpi", "shelterCpi", "coreServicesExHousing"],
    },
    {
      url: "https://www.bls.gov/schedule/news_release/empsit.htm?lv=true",
      name: "Employment Situation",
      impact: "Growth / Labor / Fed",
      importance: "high",
      tags: ["jobs", "labor"],
      relatedSeries: ["nonfarmPayrolls", "unemploymentRate", "wageGrowth"],
    },
    {
      url: "https://www.bls.gov/schedule/news_release/ppi.htm?lv=true",
      name: "Producer Price Index",
      impact: "Pipeline inflation",
      importance: "medium",
      tags: ["ppi", "inflation"],
      relatedSeries: ["cpi", "corePce"],
    },
  ];

  const settled = await Promise.allSettled(defs.map((definition) => fetchBlsSpecificSchedule(definition.url, definition)));
  const events = [];
  const warnings = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }
  return { events, warnings };
}

async function fetchBeaEvents() {
  const html = await fetchText("https://www.bea.gov/news/schedule/full");
  const rows = parseTableRows(html);
  const events = [];
  const relevant = /(GDP|Personal Income and Outlays|Personal Consumption Expenditures|Corporate Profits)/i;

  for (const row of rows) {
    const text = row.join(" | ");
    if (!relevant.test(text) || !/\d{4}/.test(text)) {
      continue;
    }
    const dateCell = row[0];
    const name = row.at(-2) ?? row.at(-1);
    if (!dateCell || !name) {
      continue;
    }
    const match = dateCell.match(/([A-Za-z]+ \d{1,2}) (\d{1,2}:\d{2} [AP]M)/);
    if (!match) {
      continue;
    }
    const yearMatch = text.match(/20\d{2}/);
    const releaseDate = `${match[1]} ${yearMatch?.[0] ?? new Date().getUTCFullYear()}`;
    events.push(
      buildEvent({
        source: "BEA",
        name,
        releaseDate,
        timeText: match[2],
        importance: /GDP|Personal Income and Outlays/i.test(name) ? "high" : "medium",
        impact: /GDP/i.test(name) ? "Growth" : "Income / PCE / Inflation",
        tags: /GDP/i.test(name) ? ["gdp"] : ["pce", "income"],
        relatedSeries: /GDP/i.test(name) ? ["retailSales", "industrialProduction"] : ["pce", "corePce", "retailSales"],
      }),
    );
  }

  return { events, warnings: [] };
}

async function fetchFomcEvents() {
  const html = await fetchText("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm");
  const matchBlock = html.match(/<a id="42828">2026 FOMC Meetings<\/a>[\s\S]*?<div class="panel panel-default"><div class="panel-heading"><h4><a id="42827">2025 FOMC Meetings<\/a>/);
  const block = matchBlock?.[0] ?? html;
  const regex = /fomc-meeting__month[^>]*><strong>([^<]+)<\/strong><\/div>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)<\/div>/g;
  const events = [];
  let entry;
  while ((entry = regex.exec(block))) {
    const monthText = entry[1].replace(/\s+/g, " ").trim();
    const dateText = entry[2].replace(/\*/g, "").trim();
    const [startDay, endDay] = dateText.split("-").map((value) => value.trim());
    const monthLabel = monthText.includes("/") ? monthText.split("/").at(-1) : monthText;
    const releaseDate = `${monthLabel} ${endDay ?? startDay} 2026`;
    events.push(
      buildEvent({
        source: "Fed",
        name: `FOMC Decision (${monthText})`,
        releaseDate,
        timeText: "02:00 PM",
        importance: "high",
        impact: "Fed / Rates / Equities",
        tags: ["fomc", "fed"],
        relatedSeries: ["effectiveFedFunds", "treasury2y", "treasury10y", "real10y"],
        notes: `Meeting window ${monthText} ${dateText}`,
      }),
    );
  }

  return { events, warnings: [] };
}

export async function fetchReleaseEvents() {
  const [bls, bea, fomc] = await Promise.all([fetchBlsEvents(), fetchBeaEvents(), fetchFomcEvents()]);
  const warnings = [...bls.warnings, ...bea.warnings, ...fomc.warnings];
  const events = uniqueBy([...bls.events, ...bea.events, ...fomc.events], (item) => item.eventId).sort((a, b) =>
    a.releaseAtUtc.localeCompare(b.releaseAtUtc),
  );

  return {
    events,
    warnings,
    sourceStatus: warnings.length ? "partial" : "ok",
  };
}

export function buildReleaseSummary(events, timeZone, days) {
  const now = new Date();
  return events
    .filter((event) => withinDays(now, event.releaseAtUtc, days))
    .map((event) => ({
      ...event,
      releaseAtLocal: formatInTimeZone(event.releaseAtUtc, timeZone),
    }));
}

export function buildTodayDigest(events, timeZone) {
  const now = new Date();
  const tomorrow = addDays(now, 1);
  return events.filter((event) => new Date(event.releaseAtUtc) >= now && new Date(event.releaseAtUtc) < tomorrow).map((event) => ({
    ...event,
    releaseAtLocal: formatInTimeZone(event.releaseAtUtc, timeZone),
  }));
}

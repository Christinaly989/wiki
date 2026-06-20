import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../utils/http.js";
import { formatInTimeZone } from "../utils/time.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const usFeedDefinitions = [
  {
    source: "Federal Reserve",
    region: "us",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
  },
  {
    source: "U.S. Treasury",
    region: "us",
    url: "https://home.treasury.gov/news/press-releases/",
    parser: "treasuryHtml",
  },
];

const globalFeedDefinitions = [
  {
    source: "ECB",
    region: "global",
    url: "https://www.ecb.europa.eu/rss/press.html",
  },
  {
    source: "BOJ",
    region: "global",
    url: "https://www.boj.or.jp/rss/whatsnew.xml",
  },
  {
    source: "BOK",
    region: "global",
    url: "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690",
  },
  {
    source: "BIS",
    region: "global",
    url: "https://www.bis.org/doclist/all_pressrels.rss",
  },
  {
    source: "Bank of England",
    region: "global",
    url: "https://www.bankofengland.co.uk/news",
    parser: "boeHtml",
  },
  {
    source: "IMF",
    region: "global",
    url: "https://www.imf.org/en/News",
    parser: "imfHtml",
  },
];

const dataKeywords = [
  "cpi",
  "inflation",
  "gdp",
  "employment",
  "labor",
  "payroll",
  "retail sales",
  "industrial production",
  "pce",
  "statistics",
  "statistical",
  "reserves",
  "trade",
  "current account",
  "consumer price",
  "producer price",
  "economic activity",
  "foreign exchange rates",
];

const policyKeywords = [
  "policy",
  "interest rate",
  "rates",
  "governing council",
  "fomc",
  "meeting",
  "monetary",
  "financial stability",
  "liquidity",
  "market operations",
];

function arrayify(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value) {
  if (!value) {
    return "";
  }
  const $ = cheerio.load(`<div>${value}</div>`);
  return $("div")
    .text()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(value, fallbackBase) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value, fallbackBase).toString();
  } catch {
    return value;
  }
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function entryLink(entry, fallbackBase) {
  if (typeof entry.link === "string") {
    return toAbsoluteUrl(entry.link, fallbackBase);
  }

  if (entry.link?.["@_href"]) {
    return toAbsoluteUrl(entry.link["@_href"], fallbackBase);
  }

  const candidate = arrayify(entry.link).find((item) => item?.["@_href"]);
  return candidate ? toAbsoluteUrl(candidate["@_href"], fallbackBase) : null;
}

function classifyCategory(title, summary) {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (dataKeywords.some((keyword) => haystack.includes(keyword))) {
    return "data";
  }
  return "news";
}

function classifyImportance(title, summary) {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (policyKeywords.some((keyword) => haystack.includes(keyword)) || dataKeywords.some((keyword) => haystack.includes(keyword))) {
    return "high";
  }
  return "medium";
}

function normalizeFeedEntries(xmlText, definition, timeZone) {
  const parsed = parser.parse(xmlText);
  const rssItems = arrayify(parsed?.rss?.channel?.item);
  const atomEntries = arrayify(parsed?.feed?.entry);
  const items = [...rssItems, ...atomEntries]
    .map((entry, index) => {
      const title = stripHtml(entry.title?.["#text"] ?? entry.title ?? "");
      const summary = stripHtml(
        entry.description?.["#text"] ??
          entry.description ??
          entry.summary?.["#text"] ??
          entry.summary ??
          entry.content?.["#text"] ??
          entry.content ??
          "",
      );
      const publishedAt =
        parseDate(entry.pubDate) ??
        parseDate(entry.published) ??
        parseDate(entry.updated) ??
        parseDate(entry.date);

      if (!title || !publishedAt) {
        return null;
      }

      return {
        id: `${definition.source}-${index}-${publishedAt}`,
        source: definition.source,
        region: definition.region,
        title,
        summary,
        publishedAt,
        publishedAtLocal: formatInTimeZone(publishedAt, timeZone),
        url: entryLink(entry, definition.url),
        category: classifyCategory(title, summary),
        importance: classifyImportance(title, summary),
      };
    })
    .filter(Boolean);

  return items;
}

function normalizeTreasuryEntries(htmlText, definition, timeZone) {
  const $ = cheerio.load(htmlText);
  const seen = new Set();
  const items = [];

  $("a[href*='/news/press-releases/']").each((index, element) => {
    const title = $(element).text().replace(/\s+/g, " ").trim();
    const href = $(element).attr("href");
    const article = $(element).closest("article, .views-row, li, div");
    const summary = article.text().replace(/\s+/g, " ").trim();
    const dateCandidate =
      article.find("time").attr("datetime") ??
      article.find("time").text().trim() ??
      summary.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/i)?.[0] ??
      null;
    const publishedAt = parseDate(dateCandidate);
    const url = toAbsoluteUrl(href, definition.url);

    if (!title || !publishedAt || !url || seen.has(url)) {
      return;
    }

    seen.add(url);
    items.push({
      id: `${definition.source}-${index}-${publishedAt}`,
      source: definition.source,
      region: definition.region,
      title,
      summary,
      publishedAt,
      publishedAtLocal: formatInTimeZone(publishedAt, timeZone),
      url,
      category: classifyCategory(title, summary),
      importance: classifyImportance(title, summary),
    });
  });

  return items;
}

function normalizeGenericHtmlEntries(htmlText, definition, timeZone) {
  const $ = cheerio.load(htmlText);
  const seen = new Set();
  const items = [];

  $("a[href]").each((index, element) => {
    const href = $(element).attr("href");
    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (!href || !title || title.length < 18) {
      return;
    }

    const article = $(element).closest("article, .views-row, li, .news-item, .card, div");
    const summary = article.text().replace(/\s+/g, " ").trim();
    const dateCandidate =
      article.find("time").attr("datetime") ??
      article.find("time").text().trim() ??
      summary.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/i)?.[0] ??
      summary.match(/\b\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\b/)?.[0] ??
      null;
    const publishedAt = parseDate(dateCandidate);
    const url = toAbsoluteUrl(href, definition.url);
    const category = classifyCategory(title, summary);

    if (!publishedAt || !url || seen.has(url)) {
      return;
    }

    const lowerUrl = url.toLowerCase();
    if (
      definition.parser === "boeHtml" &&
      !lowerUrl.includes("/news/")
    ) {
      return;
    }
    if (
      definition.parser === "imfHtml" &&
      !lowerUrl.includes("/news/")
    ) {
      return;
    }

    seen.add(url);
    items.push({
      id: `${definition.source}-${index}-${publishedAt}`,
      source: definition.source,
      region: definition.region,
      title,
      summary,
      publishedAt,
      publishedAtLocal: formatInTimeZone(publishedAt, timeZone),
      url,
      category,
      importance: classifyImportance(title, summary),
    });
  });

  return items;
}

function withinHours(isoText, hours) {
  const diff = Date.now() - new Date(isoText).getTime();
  return diff >= 0 && diff <= hours * 60 * 60 * 1000;
}

function sortRecent(items) {
  return items.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

async function fetchFeed(definition, timeZone) {
  const body = await fetchText(definition.url);
  if (definition.parser === "treasuryHtml") {
    return normalizeTreasuryEntries(body, definition, timeZone);
  }
  if (definition.parser === "boeHtml" || definition.parser === "imfHtml") {
    return normalizeGenericHtmlEntries(body, definition, timeZone);
  }
  return normalizeFeedEntries(body, definition, timeZone);
}

function lookbackHours() {
  const day = new Date().getDay();
  if (day === 6) {
    return 48;
  }
  if (day === 0 || day === 1) {
    return 72;
  }
  return 24;
}

function filterByHours(items, hours) {
  return items.filter((item) => withinHours(item.publishedAt, hours));
}

function buildRegionResult(items, hours) {
  const recentItems = filterByHours(items, hours);
  const fallbackItems = recentItems.length ? recentItems : filterByHours(items, 96);
  const dataUpdates = sortRecent(fallbackItems.filter((item) => item.category === "data")).slice(0, 4);
  const news = sortRecent(fallbackItems.filter((item) => item.category === "news")).slice(0, 4);

  return {
    dataUpdates,
    news,
  };
}

export async function fetchMacroNews(timeZone = "Asia/Shanghai") {
  const definitions = [...usFeedDefinitions, ...globalFeedDefinitions];
  const settled = await Promise.allSettled(definitions.map((definition) => fetchFeed(definition, timeZone)));
  const warnings = [];
  const items = [];
  const hours = lookbackHours();

  for (const result of settled) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  const usItems = items.filter((item) => item.region === "us");
  const globalItems = items.filter((item) => item.region === "global");

  return {
    us: buildRegionResult(usItems, hours),
    global: buildRegionResult(globalItems, hours),
    warnings,
    sourceStatus: warnings.length ? "partial" : "ok",
  };
}

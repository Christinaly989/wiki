import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentDateKey, formatInTimeZone } from "../utils/time.js";

const notionServiceDir = path.dirname(fileURLToPath(import.meta.url));
const fallbackDir = path.resolve(notionServiceDir, "../../logs/notion");
const notionVersion = "2026-03-11";

function ensureFallbackDir() {
  fs.mkdirSync(fallbackDir, { recursive: true });
}

function safeFilePart(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
}

function text(content) {
  return [{ type: "text", text: { content } }];
}

function readStateJson(db, key) {
  const raw = db.getState(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildTitle(dashboard, dateKey) {
  return `US Macro Daily | ${dateKey} | ${dashboard.regimeState.regime}`;
}

function monitorTitle(item) {
  return item.displayTitle ?? item.title;
}

function monitorSummary(item) {
  return item.displaySummary ?? item.summary;
}

function buildMarkdown(dashboard) {
  const lines = [
    `# US Macro Daily ${dashboard.regimeState.regime}`,
    "",
    `- Generated at: ${dashboard.generatedAtLocal}`,
    `- Time zone: ${dashboard.timeZone}`,
    `- Regime confidence: ${Math.round(dashboard.regimeState.confidence * 100)}%`,
    "",
    "## Headline",
    `- ${dashboard.headline.title}`,
    `- ${dashboard.headline.summary}`,
    "",
    "## Regime Call",
    dashboard.strategy.regimeCall.summary,
    ...dashboard.strategy.regimeCall.bullets.map((item) => `- ${item}`),
    "",
    "## Allocation Advice",
    dashboard.strategy.allocationAdvice.summary,
    ...dashboard.strategy.allocationAdvice.bullets.map((item) => `- ${item}`),
    "",
    "## DeepSeek Overlay",
    dashboard.aiOverlay.sections
      ? `- Model: ${dashboard.aiOverlay.model} | Reasoning: ${dashboard.aiOverlay.reasoningEffort} | Updated: ${dashboard.aiOverlay.generatedAtLocal ?? "N/A"}`
      : `- Status: ${dashboard.aiOverlay.status}${dashboard.aiOverlay.error ? ` | ${dashboard.aiOverlay.error}` : ""}`,
    "",
    ...(dashboard.aiOverlay.sections
      ? [
          "### AI Regime Judgment",
          dashboard.aiOverlay.sections.regimeJudgment.summary,
          ...dashboard.aiOverlay.sections.regimeJudgment.bullets.map((item) => `- ${item}`),
          "",
          "### AI Asset Allocation",
          dashboard.aiOverlay.sections.assetAllocation.summary,
          ...dashboard.aiOverlay.sections.assetAllocation.bullets.map((item) => `- ${item}`),
          "",
          "### AI Sector Allocation",
          dashboard.aiOverlay.sections.sectorAllocation.summary,
          ...dashboard.aiOverlay.sections.sectorAllocation.bullets.map((item) => `- ${item}`),
          "",
        ]
      : []),
    "### Drivers",
    ...dashboard.regimeState.drivers.map((driver) => `- ${driver}`),
    "",
    "### Market Implications",
    ...dashboard.regimeState.implications.map((item) => `- ${item}`),
    "",
    "## US 24h",
    "### Data Updates",
    ...dashboard.monitor.us.dataUpdates.map(
      (item) => `- ${monitorTitle(item)} | ${item.publishedAtLocal || item.publishedAt} | ${monitorSummary(item)}`,
    ),
    "",
    "### Macro News",
    ...dashboard.monitor.us.news.map((item) => `- ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
    "",
    "## Global 24h",
    "### Data Updates",
    ...dashboard.monitor.global.dataUpdates.map((item) => `- ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
    "",
    "### Macro News",
    ...dashboard.monitor.global.news.map((item) => `- ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
    "",
    "## Top Signals",
    ...dashboard.topSignals.map((signal) => `- ${signal.label}: ${signal.valueText} | ${signal.marketSignal}`),
    "",
  ];

  for (const section of dashboard.sections) {
    lines.push(`## ${section.title}`);
    lines.push(section.lead);
    lines.push("");
    for (const metric of section.metrics) {
      lines.push(
        `- ${metric.label}: ${metric.valueText} | ${metric.changeText} | ${metric.frequencyLabel} | ${metric.statusLabel} | ${metric.brief}`,
      );
    }
    lines.push("");
  }

  if (dashboard.releases.sevenDays.length) {
    lines.push("## Upcoming Releases");
    for (const event of dashboard.releases.sevenDays) {
      lines.push(`- ${event.name} | ${event.releaseAtLocal} | ${event.impact}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function writeFallbackFile(dashboard) {
  ensureFallbackDir();
  const dateKey = currentDateKey(dashboard.timeZone);
  const filePath = path.join(fallbackDir, `${safeFilePart(dateKey)}-macro-daily.md`);
  fs.writeFileSync(filePath, buildMarkdown(dashboard), "utf8");
  return filePath;
}

async function notionRequest(env, requestPath, options = {}) {
  const response = await fetch(`https://api.notion.com${requestPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": env.NOTION_VERSION ?? notionVersion,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? `Notion request failed: ${response.status}`);
  }

  return response.json();
}

function isConfigured(env) {
  return Boolean(env.NOTION_API_KEY && env.NOTION_DATA_SOURCE_ID);
}

function scoreText(score) {
  return Number.isFinite(score) ? score.toFixed(2) : "N/A";
}

function buildBlocks(dashboard) {
  const blocks = [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: text(
          `Current regime: ${dashboard.regimeState.regime} | confidence ${Math.round(
            dashboard.regimeState.confidence * 100,
          )}% | generated at ${dashboard.generatedAtLocal}`,
        ),
        icon: { type: "emoji", emoji: "\uD83E\uDDED" },
        color: "blue_background",
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: text(dashboard.headline.title),
        color: "default",
      },
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("Regime Call"),
        color: "default",
        is_toggleable: false,
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: text(dashboard.strategy.regimeCall.summary),
        color: "default",
      },
    },
    ...dashboard.strategy.regimeCall.bullets.map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(item),
        color: "default",
      },
    })),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("Allocation Advice"),
        color: "default",
        is_toggleable: false,
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: text(dashboard.strategy.allocationAdvice.summary),
        color: "default",
      },
    },
    ...dashboard.strategy.allocationAdvice.bullets.map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(item),
        color: "default",
      },
    })),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("DeepSeek Overlay"),
        color: "default",
        is_toggleable: false,
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: text(
          dashboard.aiOverlay.sections
            ? `Model ${dashboard.aiOverlay.model} | Reasoning ${dashboard.aiOverlay.reasoningEffort} | Updated ${dashboard.aiOverlay.generatedAtLocal ?? "N/A"}`
            : `Status ${dashboard.aiOverlay.status}${dashboard.aiOverlay.error ? ` | ${dashboard.aiOverlay.error}` : ""}`,
        ),
        color: "default",
      },
    },
    ...(dashboard.aiOverlay.sections
      ? [
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: text("AI Regime Judgment"),
              color: "default",
              is_toggleable: false,
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: text(dashboard.aiOverlay.sections.regimeJudgment.summary),
              color: "default",
            },
          },
          ...dashboard.aiOverlay.sections.regimeJudgment.bullets.map((item) => ({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: text(item),
              color: "default",
            },
          })),
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: text("AI Asset Allocation"),
              color: "default",
              is_toggleable: false,
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: text(dashboard.aiOverlay.sections.assetAllocation.summary),
              color: "default",
            },
          },
          ...dashboard.aiOverlay.sections.assetAllocation.bullets.map((item) => ({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: text(item),
              color: "default",
            },
          })),
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: text("AI Sector Allocation"),
              color: "default",
              is_toggleable: false,
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: text(dashboard.aiOverlay.sections.sectorAllocation.summary),
              color: "default",
            },
          },
          ...dashboard.aiOverlay.sections.sectorAllocation.bullets.map((item) => ({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: text(item),
              color: "default",
            },
          })),
        ]
      : []),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("US 24h"),
        color: "default",
        is_toggleable: false,
      },
    },
    ...dashboard.monitor.us.dataUpdates.slice(0, 3).map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(`Data | ${monitorTitle(item)} | ${item.publishedAtLocal || item.publishedAt} | ${monitorSummary(item)}`),
        color: "default",
      },
    })),
    ...dashboard.monitor.us.news.slice(0, 3).map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(`News | ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
        color: "default",
      },
    })),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("Global 24h"),
        color: "default",
        is_toggleable: false,
      },
    },
    ...dashboard.monitor.global.dataUpdates.slice(0, 3).map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(`Data | ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
        color: "default",
      },
    })),
    ...dashboard.monitor.global.news.slice(0, 3).map((item) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(`News | ${monitorTitle(item)} | ${item.source} | ${monitorSummary(item)}`),
        color: "default",
      },
    })),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("Observable Data"),
        color: "default",
        is_toggleable: false,
      },
    },
    ...dashboard.sections.flatMap((section) => [
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: text(section.title),
          color: "default",
          is_toggleable: false,
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: text(section.lead),
          color: "gray",
        },
      },
      ...section.metrics.slice(0, 8).map((metric) => ({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: text(
            `${metric.label} | ${metric.valueText} | ${metric.changeText} | ${metric.frequencyLabel} | ${metric.statusLabel} | ${metric.brief}`,
          ),
          color: "default",
        },
      })),
    ]),
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: text("Upcoming Releases"),
        color: "default",
        is_toggleable: false,
      },
    },
    ...dashboard.releases.sevenDays.slice(0, 8).map((event) => ({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: text(`${event.name} | ${event.releaseAtLocal} | ${event.impact}`),
        color: "default",
      },
    })),
  ];

  return blocks.slice(0, 100);
}

function detectPropertyByType(properties, type, candidateNames = []) {
  const entries = Object.entries(properties ?? {});
  for (const name of candidateNames) {
    const match = entries.find(([propertyName, property]) => propertyName === name && property.type === type);
    if (match) {
      return { name: match[0], property: match[1] };
    }
  }
  const fallback = entries.find(([, property]) => property.type === type);
  return fallback ? { name: fallback[0], property: fallback[1] } : null;
}

function buildProperties(schema, dashboard, dateKey) {
  const properties = {};
  const titleProperty = detectPropertyByType(schema.properties, "title", [envFallbackTitleName(schema.properties)]);
  if (!titleProperty) {
    throw new Error("Notion data source is missing a title property");
  }

  properties[titleProperty.name] = {
    title: text(buildTitle(dashboard, dateKey)),
  };

  const dateProperty = detectPropertyByType(schema.properties, "date", ["Date", "日期", "As Of"]);
  if (dateProperty) {
    properties[dateProperty.name] = {
      date: {
        start: dateKey,
      },
    };
  }

  const selectProperty = detectPropertyByType(schema.properties, "select", ["Regime", "宏观状态", "State"]);
  if (selectProperty) {
    properties[selectProperty.name] = {
      select: {
        name: dashboard.regimeState.regime,
      },
    };
  }

  const numberProperty = detectPropertyByType(schema.properties, "number", ["Confidence", "置信度"]);
  if (numberProperty) {
    properties[numberProperty.name] = {
      number: Math.round(dashboard.regimeState.confidence * 100),
    };
  }

  const richTextProperty = detectPropertyByType(schema.properties, "rich_text", ["Summary", "摘要"]);
  if (richTextProperty) {
    properties[richTextProperty.name] = {
      rich_text: text(dashboard.regimeState.summary),
    };
  }

  return properties;
}

function envFallbackTitleName(properties) {
  return Object.keys(properties ?? {}).find((name) => properties[name]?.type === "title") ?? "Name";
}

async function retrieveSchema(env) {
  return notionRequest(env, `/v1/data_sources/${env.NOTION_DATA_SOURCE_ID}`, {
    method: "GET",
  });
}

async function createPage(env, properties, children = []) {
  return notionRequest(env, "/v1/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: {
        type: "data_source_id",
        data_source_id: env.NOTION_DATA_SOURCE_ID,
      },
      properties,
      children,
      icon: {
        type: "emoji",
        emoji: "\uD83D\uDCC8",
      },
    }),
  });
}

async function updatePageProperties(env, pageId, properties) {
  await notionRequest(env, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties,
    }),
  });
}

export function buildPublishingStatus(db, env, timeZone) {
  const dateKey = currentDateKey(timeZone);
  const parsed = readStateJson(db, `notion-page:${dateKey}`);
  const latestFallback = db.getState("notion-fallback:last");

  return {
    mode: isConfigured(env) ? "notion" : "local_file",
    notionConfigured: isConfigured(env),
    lastPublishedAt: parsed?.publishedAt ?? null,
    latestPageId: parsed?.pageId ?? null,
    latestPageUrl: parsed?.pageUrl ?? null,
    latestBriefPath: latestFallback ?? null,
    statusText: isConfigured(env)
      ? parsed?.publishedAt
        ? `Notion synced at ${formatInTimeZone(parsed.publishedAt, timeZone)}`
        : "Notion configured and waiting for today's first sync"
      : "Notion not configured. Writing local markdown fallback only.",
  };
}

export async function publishDailyBrief(env, db, dashboard) {
  const fallbackPath = writeFallbackFile(dashboard);
  db.setState("notion-fallback:last", fallbackPath);

  if (!isConfigured(env)) {
    return {
      skipped: true,
      fallbackPath,
    };
  }

  const dateKey = currentDateKey(dashboard.timeZone);
  const stateKey = `notion-page:${dateKey}`;
  const existing = readStateJson(db, stateKey);
  const schema = await retrieveSchema(env);
  const properties = buildProperties(schema, dashboard, dateKey);

  if (existing) {
    await updatePageProperties(env, existing.pageId, properties);
    const nextState = {
      ...existing,
      publishedAt: new Date().toISOString(),
      fallbackPath,
    };
    db.setState(stateKey, JSON.stringify(nextState));
    return {
      skipped: false,
      pageId: existing.pageId,
      pageUrl: existing.pageUrl,
      fallbackPath,
      updated: true,
    };
  }

  const page = await createPage(env, properties, buildBlocks(dashboard));

  db.setState(
    stateKey,
    JSON.stringify({
      pageId: page.id,
      pageUrl: page.url ?? null,
      publishedAt: new Date().toISOString(),
      fallbackPath,
      title: buildTitle(dashboard, dateKey),
      growthScore: scoreText(dashboard.regimeState.scores.growth),
      inflationScore: scoreText(dashboard.regimeState.scores.inflation),
      creditScore: scoreText(dashboard.regimeState.scores.credit),
    }),
  );

  return {
    skipped: false,
    pageId: page.id,
    pageUrl: page.url ?? null,
    fallbackPath,
    created: true,
  };
}

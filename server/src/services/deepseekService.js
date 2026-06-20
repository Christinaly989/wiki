import crypto from "node:crypto";
import { formatInTimeZone } from "../utils/time.js";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultModel = "deepseek-v4-pro";
const defaultReasoningEffort = "max";
const overlayStateKey = "deepseek-overlay:last";
const newsDigestStateKey = "deepseek-news:last";

function safeJsonParse(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truncate(text, limit = 480) {
  if (!text) {
    return "";
  }

  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const pairs = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);

  return `{${pairs.join(",")}}`;
}

function buildFingerprint(input) {
  return crypto.createHash("sha1").update(stableSerialize(input)).digest("hex");
}

function isConfigured(env) {
  return Boolean(env.DEEPSEEK_API_KEY);
}

function baseModelSettings(env) {
  return {
    model: env.DEEPSEEK_MODEL ?? defaultModel,
    reasoningEffort: env.DEEPSEEK_REASONING_EFFORT ?? defaultReasoningEffort,
  };
}

function buildDisabledOverlay() {
  return {
    enabled: false,
    configured: false,
    status: "disabled",
    model: defaultModel,
    reasoningEffort: defaultReasoningEffort,
    generatedAt: null,
    generatedAtLocal: null,
    fingerprint: null,
    sections: null,
    error: null,
  };
}

function buildOverlayInput(metrics, regimeState, overview, monitor, topSignals) {
  return {
    regime: {
      regime: regimeState.regime,
      confidence: regimeState.confidence,
      drivers: regimeState.drivers,
      scores: regimeState.scores,
      summary: regimeState.summary,
      implications: regimeState.implications,
    },
    ruleOverlay: {
      headline: overview.headline,
      regimeCall: overview.strategy.regimeCall,
      allocationAdvice: overview.strategy.allocationAdvice,
    },
    monitor: {
      us: {
        dataUpdates: monitor.us.dataUpdates.slice(0, 4).map((item) => ({
          title: item.displayTitle ?? item.title,
          source: item.source,
          summary: truncate(item.displaySummary ?? item.summary, 220),
          publishedAt: item.publishedAt,
        })),
        news: monitor.us.news.slice(0, 4).map((item) => ({
          title: item.displayTitle ?? item.title,
          source: item.source,
          summary: truncate(item.displaySummary ?? item.summary, 220),
          publishedAt: item.publishedAt,
        })),
      },
      global: {
        dataUpdates: monitor.global.dataUpdates.slice(0, 4).map((item) => ({
          title: item.displayTitle ?? item.title,
          source: item.source,
          summary: truncate(item.displaySummary ?? item.summary, 220),
          publishedAt: item.publishedAt,
        })),
        news: monitor.global.news.slice(0, 4).map((item) => ({
          title: item.displayTitle ?? item.title,
          source: item.source,
          summary: truncate(item.displaySummary ?? item.summary, 220),
          publishedAt: item.publishedAt,
        })),
      },
    },
    topSignals: topSignals.slice(0, 6),
    metrics: metrics
      .filter((metric) => metric.latest)
      .map((metric) => ({
        key: metric.key,
        label: metric.label,
        group: metric.group,
        category: metric.category,
        definition: metric.definition,
        latestDate: metric.latest?.date,
        latestValue: metric.latest?.value,
        change: metric.change,
        unit: metric.unit,
        signal: metric.marketSignal,
      })),
  };
}

function flattenNewsSnapshot(newsSnapshot) {
  const groups = [
    ["us", "dataUpdates"],
    ["us", "news"],
    ["global", "dataUpdates"],
    ["global", "news"],
  ];

  return groups.flatMap(([region, bucket]) =>
    (newsSnapshot?.[region]?.[bucket] ?? []).map((item) => ({
      id: item.id,
      region,
      bucket,
      source: item.source,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt,
      importance: item.importance,
    })),
  );
}

function buildNewsInput(newsSnapshot) {
  return {
    items: flattenNewsSnapshot(newsSnapshot).slice(0, 16).map((item) => ({
      id: item.id,
      region: item.region,
      bucket: item.bucket,
      source: item.source,
      title: item.title,
      summary: truncate(normalizeText(item.summary), 180),
      publishedAt: item.publishedAt,
      importance: item.importance,
    })),
  };
}

function mergeNewsDigest(newsSnapshot, digestPayload) {
  const lookup = new Map((digestPayload.items ?? []).map((item) => [item.id, item]));

  function enrichItem(item) {
    const digest = lookup.get(item.id);
    if (!digest) {
      return item;
    }

    return {
      ...item,
      displayTitle: digest.displayTitle?.trim() || item.title,
      displaySummary: digest.displaySummary?.trim() || item.summary,
      originalLanguage: digest.originalLanguage ?? "unknown",
      translationSource: "deepseek",
    };
  }

  return {
    ...newsSnapshot,
    us: {
      ...newsSnapshot.us,
      dataUpdates: (newsSnapshot.us?.dataUpdates ?? []).map(enrichItem),
      news: (newsSnapshot.us?.news ?? []).map(enrichItem),
    },
    global: {
      ...newsSnapshot.global,
      dataUpdates: (newsSnapshot.global?.dataUpdates ?? []).map(enrichItem),
      news: (newsSnapshot.global?.news ?? []).map(enrichItem),
    },
  };
}

function validateOverlayPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("DeepSeek overlay returned an invalid payload");
  }

  const requiredSections = ["regimeJudgment", "assetAllocation", "sectorAllocation"];
  for (const sectionKey of requiredSections) {
    const section = payload[sectionKey];
    if (!section || typeof section !== "object") {
      throw new Error(`DeepSeek overlay is missing ${sectionKey}`);
    }
    if (!section.headline || !section.summary || !Array.isArray(section.bullets)) {
      throw new Error(`DeepSeek overlay section ${sectionKey} is malformed`);
    }
  }

  return payload;
}

function validateNewsDigestPayload(payload, expectedIds) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new Error("DeepSeek news digest returned an invalid payload");
  }

  const expectedIdSet = new Set(expectedIds);
  const seen = new Set();

  for (const item of payload.items) {
    if (!item?.id || !expectedIdSet.has(item.id)) {
      continue;
    }
    if (!item.displayTitle || !item.displaySummary) {
      throw new Error(`DeepSeek news digest item ${item.id} is malformed`);
    }
    seen.add(item.id);
  }

  if (seen.size === 0) {
    throw new Error("DeepSeek news digest returned no usable items");
  }

  return payload;
}

async function requestDeepSeekJson(env, { systemPrompt, input, maxTokens = 2600, thinkingEnabled = true }) {
  const settings = baseModelSettings(env);
  const response = await fetch(`${env.DEEPSEEK_BASE_URL ?? defaultBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: settings.model,
      reasoning_effort: settings.reasoningEffort,
      ...(thinkingEnabled ? { thinking: { type: "enabled" } } : {}),
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
    signal: AbortSignal.timeout(Number(env.DEEPSEEK_TIMEOUT_MS ?? 45000)),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? payload?.message ?? `DeepSeek request failed: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }

  return {
    model: payload.model ?? settings.model,
    content: JSON.parse(content),
  };
}

async function requestOverlay(env, input) {
  return requestDeepSeekJson(env, {
    input,
    maxTokens: 2600,
    systemPrompt: `You are a senior macro strategist for a single-user buy-side dashboard. Respond in valid json only.

Required JSON schema:
{
  "regimeJudgment": {
    "headline": "short title",
    "summary": "2-4 sentence judgment that layers on top of the rule-based regime call",
    "bullets": ["3-5 concise bullets"]
  },
  "assetAllocation": {
    "headline": "short title",
    "summary": "2-4 sentence allocation view across rates, duration, equity beta, dollar, credit",
    "bullets": ["3-5 concise bullets"]
  },
  "sectorAllocation": {
    "headline": "short title",
    "summary": "2-4 sentence equity sector/style view",
    "bullets": ["3-5 concise bullets"]
  },
  "keyRisks": ["up to 4 concise risks"]
}

Rules:
- Write in Chinese.
- Use the rule-based view as the baseline, then add deeper synthesis.
- Focus on regime judgment, asset allocation, and sector allocation.
- Be specific and investment-usable, not generic.
- Mention when recent US/global macro updates materially change the posture.
- Do not mention that you are an AI model.
- Output json only.`,
  });
}

async function requestNewsDigest(env, input) {
  return requestDeepSeekJson(env, {
    input,
    maxTokens: 1800,
    thinkingEnabled: false,
    systemPrompt: `You are a macro news editor for a buy-side dashboard. Respond in valid json only.

Required JSON schema:
{
  "items": [
    {
      "id": "same id from input",
      "displayTitle": "clean Chinese title with necessary English ticker/term in parentheses only when helpful",
      "displaySummary": "1-2 concise Chinese sentences that digest the macro meaning and why it matters",
      "originalLanguage": "en|ja|ko|zh|mixed|unknown"
    }
  ]
}

Rules:
- Translate all items into concise Chinese. Do not leave Japanese or Korean text untranslated.
- If the original title is already English, translate it into Chinese and keep only the necessary English term in parentheses when it improves clarity.
- The summary must digest the meaning for macro/investment monitoring, not merely restate the headline.
- Keep the tone factual, concise, and readable on a dashboard card.
- If an item is about a data release, say what moved and why it matters.
- If an item is about policy, say the likely implication for rates, FX, growth, inflation, or risk sentiment.
- Do not add commentary outside the JSON schema.
- Output json only.`,
  });
}

export function buildAiOverlayStatus(db, env, timeZone) {
  const snapshot = safeJsonParse(db.getState(overlayStateKey));
  const settings = baseModelSettings(env);

  if (!isConfigured(env)) {
    return buildDisabledOverlay();
  }

  if (!snapshot) {
    return {
      enabled: true,
      configured: true,
      status: "pending",
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      generatedAt: null,
      generatedAtLocal: null,
      fingerprint: null,
      sections: null,
      error: null,
    };
  }

  return {
    enabled: true,
    configured: true,
    status: snapshot.status ?? "ready",
    model: snapshot.model ?? settings.model,
    reasoningEffort: snapshot.reasoningEffort ?? settings.reasoningEffort,
    generatedAt: snapshot.generatedAt ?? null,
    generatedAtLocal: snapshot.generatedAt ? formatInTimeZone(snapshot.generatedAt, timeZone) : null,
    fingerprint: snapshot.fingerprint ?? null,
    sections: snapshot.sections ?? null,
    error: snapshot.error ?? null,
  };
}

export async function refreshAiOverlay(env, db, { metrics, regimeState, overview, topSignals, timeZone }) {
  if (!isConfigured(env)) {
    return buildDisabledOverlay();
  }

  const input = buildOverlayInput(metrics, regimeState, overview, overview.monitor, topSignals);
  const fingerprint = buildFingerprint(input);
  const existing = safeJsonParse(db.getState(overlayStateKey));
  const settings = baseModelSettings(env);

  if (existing?.fingerprint === fingerprint && existing?.sections) {
    return {
      enabled: true,
      configured: true,
      status: existing.status ?? "ready",
      model: existing.model ?? settings.model,
      reasoningEffort: existing.reasoningEffort ?? settings.reasoningEffort,
      generatedAt: existing.generatedAt,
      generatedAtLocal: existing.generatedAt ? formatInTimeZone(existing.generatedAt, timeZone) : null,
      fingerprint,
      sections: existing.sections,
      error: existing.error ?? null,
    };
  }

  try {
    const result = await requestOverlay(env, input);
    const sections = validateOverlayPayload(result.content);
    const generatedAt = new Date().toISOString();
    const snapshot = {
      status: "ready",
      model: result.model,
      reasoningEffort: settings.reasoningEffort,
      generatedAt,
      fingerprint,
      sections,
      error: null,
    };
    db.setState(overlayStateKey, JSON.stringify(snapshot));

    return {
      enabled: true,
      configured: true,
      status: "ready",
      model: result.model,
      reasoningEffort: settings.reasoningEffort,
      generatedAt,
      generatedAtLocal: formatInTimeZone(generatedAt, timeZone),
      fingerprint,
      sections,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = {
      status: "error",
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      generatedAt: existing?.generatedAt ?? null,
      fingerprint: existing?.fingerprint ?? null,
      sections: existing?.sections ?? null,
      error: message,
    };
    db.setState(overlayStateKey, JSON.stringify(fallback));

    return {
      enabled: true,
      configured: true,
      status: existing?.sections ? "stale" : "error",
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      generatedAt: existing?.generatedAt ?? null,
      generatedAtLocal: existing?.generatedAt ? formatInTimeZone(existing.generatedAt, timeZone) : null,
      fingerprint: existing?.fingerprint ?? null,
      sections: existing?.sections ?? null,
      error: message,
    };
  }
}

export async function refreshNewsDigest(env, db, { newsSnapshot }) {
  if (!isConfigured(env)) {
    return {
      news: newsSnapshot,
      status: "disabled",
      error: null,
    };
  }

  const input = buildNewsInput(newsSnapshot);
  if (!input.items.length) {
    return {
      news: newsSnapshot,
      status: "empty",
      error: null,
    };
  }

  const fingerprint = buildFingerprint(input);
  const existing = safeJsonParse(db.getState(newsDigestStateKey));
  const settings = baseModelSettings(env);

  if (existing?.fingerprint === fingerprint && existing?.snapshot) {
    return {
      news: existing.snapshot,
      status: existing.status ?? "ready",
      error: existing.error ?? null,
      model: existing.model ?? settings.model,
    };
  }

  try {
    const result = await requestNewsDigest(env, input);
    const digest = validateNewsDigestPayload(
      result.content,
      input.items.map((item) => item.id),
    );
    const enrichedNews = mergeNewsDigest(newsSnapshot, digest);
    const generatedAt = new Date().toISOString();

    db.setState(
      newsDigestStateKey,
      JSON.stringify({
        status: "ready",
        model: result.model,
        reasoningEffort: settings.reasoningEffort,
        generatedAt,
        fingerprint,
        snapshot: enrichedNews,
        error: null,
      }),
    );

    return {
      news: enrichedNews,
      status: "ready",
      error: null,
      model: result.model,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackNews =
      existing?.fingerprint === fingerprint && existing?.snapshot ? existing.snapshot : newsSnapshot;

    db.setState(
      newsDigestStateKey,
      JSON.stringify({
        status: existing?.snapshot ? "stale" : "error",
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        generatedAt: existing?.generatedAt ?? null,
        fingerprint: existing?.fingerprint ?? fingerprint,
        snapshot: fallbackNews,
        error: message,
      }),
    );

    return {
      news: fallbackNews,
      status: existing?.snapshot ? "stale" : "error",
      error: message,
      model: settings.model,
    };
  }
}

import type { DashboardPayload } from "./types"

function normalizeMetric(metric: any) {
  const history = Array.isArray(metric?.history)
    ? metric.history.filter(
        (point: any) => typeof point?.date === "string" && Number.isFinite(point?.value),
      )
    : []

  return {
    ...metric,
    category: metric?.category ?? "",
    sourceLabel: metric?.sourceLabel ?? "Unknown",
    definition: metric?.definition ?? "Level",
    frequencyLabel: metric?.frequencyLabel ?? metric?.frequency ?? "N/A",
    marketSignal: metric?.marketSignal ?? "Monitoring",
    history,
    valueText: metric?.valueText ?? "N/A",
    changeText: metric?.changeText ?? "N/A",
    changeDirection:
      metric?.changeDirection === "up" || metric?.changeDirection === "down" || metric?.changeDirection === "flat"
        ? metric.changeDirection
        : "flat",
    asOfText: metric?.asOfText ?? "N/A",
    isStale: Boolean(metric?.isStale),
    statusLabel: metric?.statusLabel ?? "Watch",
    statusTone:
      metric?.statusTone === "positive" ||
      metric?.statusTone === "caution" ||
      metric?.statusTone === "negative" ||
      metric?.statusTone === "neutral"
        ? metric.statusTone
        : "neutral",
    brief: typeof metric?.brief === "string" && metric.brief.trim() ? metric.brief : metric?.marketSignal ?? "Monitoring",
  }
}

function normalizeSection(section: any) {
  return {
    ...section,
    title: section?.title ?? "",
    lead: section?.lead ?? "",
    perspective: section?.perspective ?? "",
    metrics: Array.isArray(section?.metrics) ? section.metrics.map(normalizeMetric) : [],
  }
}

function normalizeDashboard(payload: any): DashboardPayload {
  return {
    ...payload,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter((item: any) => typeof item === "string") : [],
    topSignals: Array.isArray(payload?.topSignals) ? payload.topSignals : [],
    feed: Array.isArray(payload?.feed) ? payload.feed : [],
    sections: Array.isArray(payload?.sections) ? payload.sections.map(normalizeSection) : [],
    releases: {
      sevenDays: Array.isArray(payload?.releases?.sevenDays) ? payload.releases.sevenDays : [],
      thirtyDays: Array.isArray(payload?.releases?.thirtyDays) ? payload.releases.thirtyDays : [],
    },
  } as DashboardPayload
}

async function request(path: string, options?: RequestInit): Promise<DashboardPayload> {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
    },
    ...options,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
  }

  return normalizeDashboard(await response.json())
}

export function fetchDashboard() {
  return request("/api/dashboard")
}

export function refreshDashboard() {
  return request("/api/refresh", {
    method: "POST",
  })
}

export function publishNotionBrief() {
  return request("/api/publish/notion", {
    method: "POST",
  })
}

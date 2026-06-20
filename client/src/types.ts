export interface MetricPoint {
  date: string
  value: number
  rawValue?: number
}

export interface MetricSnapshot {
  date: string
  value: number
  rawValue?: number
}

export interface Metric {
  key: string
  label: string
  category: string
  group: string
  sourceLabel: string
  definition: string
  unit: string
  frequency: string
  frequencyLabel: string
  importance: "high" | "medium" | "low"
  marketSignal: string
  latest: MetricSnapshot | null
  previous: MetricSnapshot | null
  change: number | null
  history: MetricPoint[]
  valueText: string
  changeText: string
  changeDirection: "up" | "down" | "flat"
  asOfText: string
  isStale: boolean
  statusLabel: string
  statusTone: "positive" | "caution" | "negative" | "neutral"
  brief: string
}

export interface Section {
  key: string
  title: string
  lead: string
  perspective: string
  metrics: Metric[]
}

export interface ReleaseEvent {
  eventId: string
  source: string
  name: string
  releaseAtUtc: string
  releaseAtLocal: string
  importance: "high" | "medium" | "low"
  impact: string
  tags: string[]
  relatedSeries: string[]
  notes: string
  status: string
}

export interface FeedItem {
  alertId: string
  createdAt: string
  alertType: string
  severity: "high" | "medium" | "low"
  title: string
  body: string
  impactedAssets: string[]
}

export interface MonitorItem {
  id: string
  source: string
  title: string
  summary: string
  displayTitle?: string
  displaySummary?: string
  originalLanguage?: string
  translationSource?: string
  publishedAt: string
  publishedAtLocal: string
  importance: "high" | "medium" | "low"
  url: string | null
}

export interface TopSignal {
  key: string
  label: string
  valueText: string
  marketSignal: string
  date: string
}

export interface AiOverlaySection {
  headline: string
  summary: string
  bullets: string[]
}

export interface DashboardPayload {
  generatedAt: string
  generatedAtLocal: string
  timeZone: string
  headline: {
    title: string
    summary: string
  }
  strategy: {
    regimeCall: {
      title: string
      summary: string
      bullets: string[]
    }
    allocationAdvice: {
      title: string
      summary: string
      bullets: string[]
    }
  }
  monitor: {
    us: {
      title: string
      dataUpdates: MonitorItem[]
      news: MonitorItem[]
    }
    global: {
      title: string
      dataUpdates: MonitorItem[]
      news: MonitorItem[]
    }
  }
  aiOverlay: {
    enabled: boolean
    configured: boolean
    status: "disabled" | "pending" | "ready" | "stale" | "error"
    model: string
    reasoningEffort: string
    generatedAt: string | null
    generatedAtLocal: string | null
    fingerprint: string | null
    sections: {
      regimeJudgment: AiOverlaySection
      assetAllocation: AiOverlaySection
      sectorAllocation: AiOverlaySection
      keyRisks?: string[]
    } | null
    error: string | null
  }
  regimeState: {
    asOf: string
    regime: "Goldilocks" | "Reflation" | "Recession" | "Stagflation"
    confidence: number
    summary: string
    drivers: string[]
    implications: string[]
    scores: {
      growth: number
      inflation: number
      credit: number
    }
  }
  sourceStatus: {
    fred: string
    treasury: string
    releases: string
    news: string
    ai: string
  }
  configStatus: {
    fredConfigured: boolean
    notionConfigured: boolean
    deepseekConfigured: boolean
  }
  publishing: {
    mode: "notion" | "local_file"
    notionConfigured: boolean
    lastPublishedAt: string | null
    latestPageId: string | null
    latestPageUrl: string | null
    latestBriefPath: string | null
    statusText: string
  }
  warnings: string[]
  topSignals: TopSignal[]
  sections: Section[]
  releases: {
    sevenDays: ReleaseEvent[]
    thirtyDays: ReleaseEvent[]
  }
  feed: FeedItem[]
}

import { startTransition, useEffect, useState } from "react"
import { fetchDashboard, publishNotionBrief, refreshDashboard } from "./api"
import { LineChart } from "./components/LineChart"
import type {
  AiOverlaySection,
  DashboardPayload,
  MonitorItem,
  ReleaseEvent,
  Section,
} from "./types"
import "./App.css"

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function regimeTone(regime: DashboardPayload["regimeState"]["regime"]) {
  if (regime === "Goldilocks") return "regime-gold"
  if (regime === "Reflation") return "regime-red"
  if (regime === "Recession") return "regime-blue"
  return "regime-amber"
}

function statusClass(metric: Section["metrics"][number]) {
  return `status-pill status-${metric.statusTone}`
}

function changeClass(metric: Section["metrics"][number]) {
  return `change-${metric.changeDirection}`
}

function sourceLabel(status: string) {
  const map: Record<string, string> = {
    ok: "Live",
    partial: "Partial",
    cached: "Cached",
    missing_api_key: "Missing Key",
    disabled: "Disabled",
    pending: "Pending",
    ready: "Ready",
    stale: "Stale",
    error: "Error",
  }

  return map[status] ?? status
}

function renderRelease(event: ReleaseEvent, timeZone: string) {
  return (
    <article className={`release-card release-${event.importance}`} key={event.eventId}>
      <div className="release-topline">
        <span>{event.source}</span>
        <span>{formatDateTime(event.releaseAtUtc, timeZone)}</span>
      </div>
      <h4>{event.name}</h4>
      <p>{event.impact}</p>
      {event.notes ? <small>{event.notes}</small> : null}
    </article>
  )
}

function renderSection(section: Section) {
  const featuredMetrics = section.metrics.filter((metric) => (metric.history ?? []).length > 3).slice(0, 3)

  return (
    <section className="macro-section" key={section.key}>
      <div className="section-head">
        <div>
          <p className="eyebrow">{section.title}</p>
          <h2>{section.lead}</h2>
          <p className="section-perspective">{section.perspective}</p>
        </div>
      </div>

      <article className="table-panel">
        <div className="table-scroll">
          <table className="indicator-table">
            <thead>
              <tr className="table-bands">
                <th colSpan={6}>Observable Data</th>
                <th className="view-band" colSpan={2}>
                  House View
                </th>
              </tr>
              <tr>
                <th>Indicator</th>
                <th>Value</th>
                <th>Chg</th>
                <th>Freq</th>
                <th>As Of</th>
                <th>Source</th>
                <th className="view-col-head">Status</th>
                <th className="view-col-head">Brief</th>
              </tr>
            </thead>
            <tbody>
              {section.metrics.map((metric) => (
                <tr key={metric.key}>
                  <td>
                    <div className="indicator-cell">
                      <strong>{metric.label}</strong>
                      <span>
                        {metric.category} · {metric.definition}
                      </span>
                    </div>
                  </td>
                  <td className="value-cell">{metric.valueText}</td>
                  <td className={changeClass(metric)}>{metric.changeText}</td>
                  <td>{metric.frequencyLabel}</td>
                  <td>
                    <div className="asof-cell">
                      <span>{metric.asOfText}</span>
                      {metric.isStale ? <small className="stale-flag">Stale</small> : null}
                    </div>
                  </td>
                  <td>{metric.sourceLabel}</td>
                  <td className="view-col">
                    <span className={statusClass(metric)}>{metric.statusLabel}</span>
                  </td>
                  <td className="view-col brief-cell">{metric.brief}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {featuredMetrics.length ? (
        <div className="chart-grid">
          {featuredMetrics.map((metric) => (
            <article className="chart-card" key={metric.key}>
              <div className="chart-copy">
                <small>
                  {metric.sourceLabel} · {metric.definition}
                </small>
                <strong>{metric.label}</strong>
                <span>
                  {metric.valueText} / {metric.asOfText}
                </span>
              </div>
              <LineChart metric={metric} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function renderMonitorItem(item: MonitorItem, timeZone: string) {
  const title = item.displayTitle ?? item.title
  const summary = item.displaySummary ?? item.summary
  const showSummary = Boolean(summary && summary !== title)

  return (
    <article className={`monitor-item importance-${item.importance}`} key={item.id}>
      <div className="monitor-topline">
        <span>{item.source}</span>
        <span>{item.publishedAtLocal || formatDateTime(item.publishedAt, timeZone)}</span>
      </div>
      <strong>{title}</strong>
      {showSummary ? <p>{summary}</p> : null}
      {item.url ? (
        <a href={item.url} rel="noreferrer" target="_blank">
          打开原文
        </a>
      ) : null}
    </article>
  )
}

function renderMonitorPanel(
  title: string,
  dataUpdates: MonitorItem[],
  news: MonitorItem[],
  timeZone: string,
) {
  return (
    <article className="panel-card monitor-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>近 24 小时，周末自动回看至周五</span>
      </div>
      <div className="monitor-section">
        <h3>数据更新</h3>
        <div className="monitor-list monitor-list-compact">
          {dataUpdates.map((item) => renderMonitorItem(item, timeZone))}
        </div>
      </div>
      <div className="monitor-section">
        <h3>关键宏观新闻</h3>
        <div className="monitor-list">{news.map((item) => renderMonitorItem(item, timeZone))}</div>
      </div>
    </article>
  )
}

function renderStrategyPanel(title: string, summary: string, bullets: string[]) {
  return (
    <article className="panel-card strategy-card">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <p className="strategy-summary">{summary}</p>
      <ul className="strategy-list">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </article>
  )
}

function renderAiSection(title: string, section: AiOverlaySection) {
  return (
    <article className="panel-card ai-card" key={title}>
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <strong className="ai-subhead">{section.headline}</strong>
      <p className="strategy-summary">{section.summary}</p>
      <ul className="strategy-list">
        {section.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </article>
  )
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeZone, setTimeZone] = useState<"Asia/Shanghai" | "America/New_York">("Asia/Shanghai")

  useEffect(() => {
    let active = true

    fetchDashboard()
      .then((payload) => {
        if (!active) return
        startTransition(() => {
          setDashboard(payload)
          setError(null)
          setLoading(false)
        })
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const payload = await refreshDashboard()
      startTransition(() => {
        setDashboard(payload)
        setError(null)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新失败")
    } finally {
      setRefreshing(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      const payload = await publishNotionBrief()
      startTransition(() => {
        setDashboard(payload)
        setError(null)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步到 Notion 失败")
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return <main className="app-shell loading-state">正在加载美国宏观看板...</main>
  }

  if (error && !dashboard) {
    return (
      <main className="app-shell loading-state">
        <p>加载失败：{error}</p>
        <button className="action-button" onClick={handleRefresh} type="button">
          重试
        </button>
      </main>
    )
  }

  if (!dashboard) {
    return null
  }

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div className="toolbar-left">
          <button className="action-button" disabled={refreshing} onClick={handleRefresh} type="button">
            {refreshing ? "刷新中..." : "手动刷新"}
          </button>
          <button className="secondary-button" disabled={publishing} onClick={handlePublish} type="button">
            {publishing ? "同步中..." : "同步到 Notion"}
          </button>
          <div className="timezone-toggle">
            <button
              className={timeZone === "Asia/Shanghai" ? "active" : ""}
              onClick={() => setTimeZone("Asia/Shanghai")}
              type="button"
            >
              北京时间
            </button>
            <button
              className={timeZone === "America/New_York" ? "active" : ""}
              onClick={() => setTimeZone("America/New_York")}
              type="button"
            >
              美东时间
            </button>
          </div>
        </div>
        <div className="source-grid">
          <span>FRED: {sourceLabel(dashboard.sourceStatus.fred)}</span>
          <span>Treasury: {sourceLabel(dashboard.sourceStatus.treasury)}</span>
          <span>Calendars: {sourceLabel(dashboard.sourceStatus.releases)}</span>
          <span>News: {sourceLabel(dashboard.sourceStatus.news)}</span>
          <span>AI: {sourceLabel(dashboard.sourceStatus.ai)}</span>
        </div>
      </section>

      <section className="publishing-panel">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>每日摘要写入 Notion 数据库</h2>
          <p>{dashboard.publishing.statusText}</p>
        </div>
        <div className="publishing-meta">
          {dashboard.publishing.latestPageUrl ? (
            <a href={dashboard.publishing.latestPageUrl} rel="noreferrer" target="_blank">
              打开最新 Notion 页面
            </a>
          ) : null}
          {dashboard.publishing.latestBriefPath ? <span>Fallback file: {dashboard.publishing.latestBriefPath}</span> : null}
        </div>
      </section>

      {!dashboard.configStatus.fredConfigured || !dashboard.configStatus.notionConfigured || !dashboard.configStatus.deepseekConfigured ? (
        <section className="setup-banner">
          {!dashboard.configStatus.fredConfigured ? (
            <p>尚未配置 `FRED_API_KEY`。增长和通胀模块不会完整，页面会优先展示 Treasury 与官方日历数据。</p>
          ) : null}
          {!dashboard.configStatus.notionConfigured ? (
            <p>尚未配置 `NOTION_API_KEY` 和 `NOTION_DATA_SOURCE_ID`。系统会保留本地摘要，但不会写入 Notion 数据库。</p>
          ) : null}
          {!dashboard.configStatus.deepseekConfigured ? (
            <p>尚未配置 `DEEPSEEK_API_KEY`。当前只会显示规则层判断，不会叠加 DeepSeek 深度分析和新闻摘要。</p>
          ) : null}
        </section>
      ) : null}

      {dashboard.warnings.length ? (
        <section className="warning-ribbon">
          {dashboard.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      ) : null}

      <section className="strategy-grid">
        {renderStrategyPanel(
          dashboard.strategy.regimeCall.title,
          dashboard.strategy.regimeCall.summary,
          dashboard.strategy.regimeCall.bullets,
        )}
        {renderStrategyPanel(
          dashboard.strategy.allocationAdvice.title,
          dashboard.strategy.allocationAdvice.summary,
          dashboard.strategy.allocationAdvice.bullets,
        )}
      </section>

      {dashboard.aiOverlay.enabled ? (
        <section className="panel-card ai-overlay-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">DeepSeek Overlay</p>
              <h2>AI 深度分析</h2>
            </div>
            <div className="ai-meta">
              <span>Model {dashboard.aiOverlay.model}</span>
              <span>Reasoning {dashboard.aiOverlay.reasoningEffort}</span>
              <span>
                {dashboard.aiOverlay.generatedAtLocal ? `更新于 ${dashboard.aiOverlay.generatedAtLocal}` : "等待首次生成"}
              </span>
            </div>
          </div>
          {dashboard.aiOverlay.sections ? (
            <>
              <div className="ai-grid">
                {renderAiSection("AI Regime Judgment", dashboard.aiOverlay.sections.regimeJudgment)}
                {renderAiSection("AI Asset Allocation", dashboard.aiOverlay.sections.assetAllocation)}
                {renderAiSection("AI Sector Allocation", dashboard.aiOverlay.sections.sectorAllocation)}
              </div>
              {dashboard.aiOverlay.sections.keyRisks?.length ? (
                <div className="ai-risks">
                  <h3>AI Key Risks</h3>
                  <ul className="strategy-list">
                    {dashboard.aiOverlay.sections.keyRisks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="strategy-summary">
              {dashboard.aiOverlay.error
                ? `DeepSeek 分析暂时不可用：${dashboard.aiOverlay.error}`
                : "DeepSeek 已启用，等待首次生成分析。"}
            </p>
          )}
        </section>
      ) : null}

      <section className="monitor-grid">
        {renderMonitorPanel(
          dashboard.monitor.us.title,
          dashboard.monitor.us.dataUpdates,
          dashboard.monitor.us.news,
          timeZone,
        )}
        {renderMonitorPanel(
          dashboard.monitor.global.title,
          dashboard.monitor.global.dataUpdates,
          dashboard.monitor.global.news,
          timeZone,
        )}
      </section>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Today's Macro Shift</p>
          <h1>{dashboard.headline.title}</h1>
          <p className="hero-summary">{dashboard.headline.summary}</p>
          <div className="hero-meta">
            <span>最近刷新 {formatDateTime(dashboard.generatedAt, timeZone)}</span>
            <span>默认时区 {dashboard.timeZone}</span>
            <span>Notion {dashboard.publishing.mode === "notion" ? "Enabled" : "Fallback"}</span>
          </div>
        </div>

        <div className={`regime-panel ${regimeTone(dashboard.regimeState.regime)}`}>
          <span className="regime-label">Current Regime</span>
          <strong>{dashboard.regimeState.regime}</strong>
          <span>置信度 {Math.round(dashboard.regimeState.confidence * 100)}%</span>
          <div className="score-strip score-strip-3">
            <div>
              <small>Growth Score</small>
              <strong>{dashboard.regimeState.scores.growth}</strong>
            </div>
            <div>
              <small>Inflation Score</small>
              <strong>{dashboard.regimeState.scores.inflation}</strong>
            </div>
            <div>
              <small>Credit Score</small>
              <strong>{dashboard.regimeState.scores.credit}</strong>
            </div>
          </div>
          <ul className="driver-list">
            {dashboard.regimeState.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="signal-grid">
        {dashboard.topSignals.map((signal) => (
          <article className="signal-card" key={signal.key}>
            <small>{signal.label}</small>
            <strong>{signal.valueText}</strong>
            <span>{signal.marketSignal}</span>
            <time>{signal.date}</time>
          </article>
        ))}
      </section>

      <section className="insight-grid">
        <article className="panel-card">
          <div className="panel-head">
            <h2>主动提醒 Feed</h2>
            <span>{dashboard.feed.length} 条</span>
          </div>
          <div className="feed-list">
            {dashboard.feed.length ? (
              dashboard.feed.map((item) => (
                <article className={`feed-item severity-${item.severity}`} key={item.alertId}>
                  <div className="feed-topline">
                    <strong>{item.title}</strong>
                    <span>{formatDateTime(item.createdAt, timeZone)}</span>
                  </div>
                  <p>{item.body}</p>
                  <small>{item.impactedAssets.join(" / ")}</small>
                </article>
              ))
            ) : (
              <article className="feed-item severity-low">
                <div className="feed-topline">
                  <strong>还没有新的变化提醒</strong>
                </div>
                <p>完成一次手动刷新，或等下一条关键数据发布后，这里会累计新的变化记录。</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <h2>未来 7 天关键发布</h2>
            <span>{dashboard.releases.sevenDays.length} 项</span>
          </div>
          <div className="release-list">{dashboard.releases.sevenDays.map((event) => renderRelease(event, timeZone))}</div>
        </article>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <h2>未来 30 天发布日历</h2>
          <span>{dashboard.releases.thirtyDays.length} 项</span>
        </div>
        <div className="calendar-grid">{dashboard.releases.thirtyDays.map((event) => renderRelease(event, timeZone))}</div>
      </section>

      {dashboard.sections.map((section) => renderSection(section))}
    </main>
  )
}

export default App

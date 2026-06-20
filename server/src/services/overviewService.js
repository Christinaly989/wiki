import { formatInTimeZone } from "../utils/time.js";

function metricMapFromList(metrics) {
  return Object.fromEntries(metrics.map((metric) => [metric.key, metric]));
}

function metricValue(metrics, key) {
  return metrics[key]?.latest?.value ?? null;
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function withinHours(isoText, hours) {
  const diff = Date.now() - new Date(isoText).getTime();
  return diff >= 0 && diff <= hours * 60 * 60 * 1000;
}

function formatAlertTime(value, timeZone) {
  return formatInTimeZone(value, timeZone);
}

function formatCompactValue(value, unit = "", spacedUnit = false) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const rounded = Number(value.toFixed(2));
  if (!unit) {
    return `${rounded}`;
  }

  if (unit === "%") {
    return spacedUnit ? `${rounded} %` : `${rounded}%`;
  }

  return spacedUnit ? `${rounded} ${unit}` : `${rounded}${unit}`;
}

function buildAlertLine(alert, metric) {
  if (metric?.latest?.value !== undefined && Number.isFinite(metric.latest.value)) {
    const latestText = formatCompactValue(metric.latest.value, metric.unit, false);
    const previousText = metric.previous?.value !== undefined && Number.isFinite(metric.previous.value)
      ? formatCompactValue(metric.previous.value, metric.unit, false)
      : null;
    const changeText = Number.isFinite(metric.change) ? formatCompactValue(Math.abs(metric.change), metric.unit, true) : null;

    if (previousText && changeText) {
      return `${metric.label} 相比上期变化 ${changeText}到${latestText}`;
    }
    return `${metric.label} 最新值 ${latestText}`;
  }

  return `${alert.title} | ${alert.body}`;
}

function buildAlertDataUpdates(alerts, metrics, timeZone) {
  const metricMap = metricMapFromList(metrics);
  return alerts
    .filter((alert) => withinHours(alert.createdAt, 24))
    .slice(0, 4)
    .map((alert) => ({
      id: alert.alertId,
      source: "Dashboard refresh",
      title: buildAlertLine(alert, metricMap[alert.metadata?.metricKey]),
      summary: buildAlertLine(alert, metricMap[alert.metadata?.metricKey]),
      publishedAt: alert.createdAt,
      publishedAtLocal: formatAlertTime(alert.createdAt, timeZone),
      importance: alert.severity,
      url: null,
    }));
}

function growthClause(metricMap) {
  const payrolls = metricValue(metricMap, "nonfarmPayrolls");
  const unemployment = metricValue(metricMap, "unemploymentRate");

  if (Number.isFinite(payrolls) && payrolls >= 175 && Number.isFinite(unemployment) && unemployment <= 4.3) {
    return "增长和就业韧性仍在";
  }
  if (Number.isFinite(unemployment) && unemployment >= 4.7) {
    return "劳动力市场已明显走弱";
  }
  return "增长正在降温但尚未失速";
}

function inflationClause(regimeState) {
  if (regimeState.scores.inflation >= 1) {
    return "通胀黏性还没有真正退去";
  }
  if (regimeState.scores.inflation <= -0.5) {
    return "通胀回落正给政策松绑";
  }
  return "通胀比目标更近，但还不够干净";
}

function creditClause(regimeState) {
  if (regimeState.scores.credit >= 0.8) {
    return "信用环境仍偏宽松";
  }
  if (regimeState.scores.credit <= -0.5) {
    return "信用条件开始收紧";
  }
  return "信用环境大致中性";
}

function buildHeadline(metricMap, regimeState, usMonitor) {
  const leadUpdate = usMonitor.dataUpdates[0]?.title
    ?.replace(" 触发阈值提醒", "")
    ?.replace(" 更新", "");
  const clauses = [growthClause(metricMap), inflationClause(regimeState), creditClause(regimeState)];

  return {
    title: leadUpdate ? `${leadUpdate} 后，${clauses.join("，")}` : clauses.join("，"),
    summary: `${regimeState.summary} 当前更值得盯住的是 24 小时内的新数据与官方表态是否在强化这条主线。`,
  };
}

function creditAssessment(creditScore) {
  if (creditScore >= 0.8) {
    return "信用利差仍低，风险偏好没有被信用端主动打断。";
  }
  if (creditScore <= -0.5) {
    return "信用利差抬升已经在提示融资条件边际收紧。";
  }
  return "信用还没有明显拖后腿，但也不是进一步放松的状态。";
}

function buildRegimeCall(regimeState) {
  return {
    title: `当前判断：${regimeState.regime}`,
    summary: `${regimeState.summary} ${creditAssessment(regimeState.scores.credit)}`,
    bullets: [
      ...regimeState.drivers.slice(0, 4),
      `Growth score ${regimeState.scores.growth} / Inflation score ${regimeState.scores.inflation} / Credit score ${regimeState.scores.credit}`,
    ],
  };
}

function buildAllocationAdvice(regimeState, metricMap, usMonitor, globalMonitor) {
  const recentUs = usMonitor.dataUpdates[0]?.title?.replace(" 触发阈值提醒", "") ?? "美国数据边际变化";
  const realGlobalNews = [...globalMonitor.news, ...globalMonitor.dataUpdates].find((item) => item.source !== "Monitor");
  const recentGlobal = realGlobalNews?.displayTitle ?? realGlobalNews?.title ?? "全球官方源站暂时平静";
  const treasury10y = metricValue(metricMap, "treasury10y");
  const creditSpread = metricValue(metricMap, "creditSpread");

  const base = {
    Goldilocks: {
      summary: "股债都可以持有风险，但重点是偏向质量而不是盲目追 beta。",
      bullets: [
        "债券：逐步增加中长久期，优先高质量利率债。",
        "权益：成长和优质周期可以均衡配置，软件、半导体、工业自动化相对受益。",
        "行业分配：降低纯防御超配，转向盈利可见度高的成长与龙头周期。",
      ],
    },
    Reflation: {
      summary: "更像名义增长占优的环境，股优于长债，但折现率仍会约束高估值资产。",
      bullets: [
        "债券：久期保持偏短或中性，优先现金、短债、TIPS，谨慎追长端。",
        "权益：偏向 financials、energy、industrials、materials 和具备定价权的 quality cyclicals。",
        "行业分配：降低 long-duration growth 权重，利率敏感的公用事业和高分红替代要更谨慎。",
      ],
    },
    Recession: {
      summary: "先保护盈利和现金流，再谈估值扩张。",
      bullets: [
        "债券：增加久期和高质量政府债敞口，回避低等级信用。",
        "权益：提高 healthcare、staples、utilities、quality compounders 权重。",
        "行业分配：下调可选消费、低质量小盘和高杠杆周期股。",
      ],
    },
    Stagflation: {
      summary: "对股债都不友好，配置上要优先真实现金流和抗通胀能力。",
      bullets: [
        "债券：控制久期，优先短端利率工具和抗通胀资产，少碰低质量信用。",
        "权益：偏向 energy、commodities、defensive cash flow，谨慎高估值成长。",
        "行业分配：降低可选消费、小盘和对融资极敏感的板块。",
      ],
    },
  }[regimeState.regime];

  const valuationLine =
    Number.isFinite(treasury10y) && treasury10y >= 4.5
      ? "10Y 利率仍在高位，估值扩张空间要按更严格标准看待。"
      : "长端利率没有继续恶化，估值端暂时不是最主要阻力。";
  const creditLine =
    Number.isFinite(creditSpread) && creditSpread <= 1
      ? "信用利差仍窄，风险偏好尚未被信用端破坏。"
      : "信用端开始变得更重要，若利差继续走阔要更快降风险。";

  return {
    title: "资产与行业分配建议",
    summary: `${recentUs} 与 ${recentGlobal} 共同作用下，当前更适合沿着 ${regimeState.regime} 的主线来配置。`,
    bullets: [...base.bullets, valuationLine, creditLine],
  };
}

function fallbackCard(id, title, summary) {
  return {
    id,
    source: "Monitor",
    title,
    summary,
    publishedAt: new Date().toISOString(),
    publishedAtLocal: "",
    importance: "low",
    url: null,
  };
}

function buildRegionPanel(regionTitle, dataUpdates, news) {
  return {
    title: regionTitle,
    dataUpdates: dataUpdates.length ? dataUpdates : [fallbackCard(`${regionTitle}-data`, "最近 24 小时没有新的数据卡片", "下一次刷新后会自动补入。")],
    news: news.length ? news : [fallbackCard(`${regionTitle}-news`, "最近 24 小时没有新的官方宏观新闻", "如果外部源站有更新，这里会自动出现。")],
  };
}

export function buildDashboardOverview(metrics, regimeState, alerts, newsSnapshot, timeZone = "Asia/Shanghai") {
  const metricMap = metricMapFromList(metrics);
  const usDataUpdates = buildAlertDataUpdates(alerts, metrics, timeZone);
  const usMonitor = buildRegionPanel("美国 24h", usDataUpdates, newsSnapshot?.us?.news ?? []);
  const globalMonitor = buildRegionPanel(
    "全球 24h",
    newsSnapshot?.global?.dataUpdates ?? [],
    newsSnapshot?.global?.news ?? [],
  );

  return {
    headline: buildHeadline(metricMap, regimeState, usMonitor),
    strategy: {
      regimeCall: buildRegimeCall(regimeState),
      allocationAdvice: buildAllocationAdvice(regimeState, metricMap, usMonitor, globalMonitor),
    },
    monitor: {
      us: usMonitor,
      global: globalMonitor,
    },
  };
}

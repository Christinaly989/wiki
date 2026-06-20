const frequencyLabels = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const staleThresholdDays = {
  daily: 10,
  weekly: 21,
  monthly: 75,
  quarterly: 140,
  yearly: 430,
};

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function isPercentUnit(unit) {
  return unit === "%" || unit === "bp";
}

export function formatMetricValue(metric, value = metric.latest?.value ?? null) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  if (metric.unit === "%") {
    return `${round(value, 2)}%`;
  }

  if (metric.unit === "bp") {
    return `${round(value, 0)} bp`;
  }

  if (metric.unit === "K jobs") {
    return `${formatNumber(round(value, 0), 0)}K`;
  }

  if (metric.unit === "K") {
    return `${formatNumber(round(value, 0), 0)} K`;
  }

  if (metric.unit === "M") {
    return `${round(value, 2)} M`;
  }

  if (!metric.unit) {
    return formatNumber(round(value, value >= 100 ? 0 : 2), value >= 100 ? 0 : 2);
  }

  return `${round(value, 2)} ${metric.unit}`;
}

export function formatMetricChange(metric) {
  if (!Number.isFinite(metric.change)) {
    return {
      text: "New",
      direction: "flat",
    };
  }

  const sign = metric.change > 0 ? "+" : "";
  const rounded = metric.unit === "bp" ? round(metric.change, 0) : round(metric.change, 2);
  const suffix = isPercentUnit(metric.unit) ? metric.unit : metric.unit ? ` ${metric.unit}` : "";
  return {
    text: `${sign}${rounded}${suffix}`,
    direction: metric.change > 0 ? "up" : metric.change < 0 ? "down" : "flat",
  };
}

function statusFromRange(value, ranges) {
  for (const range of ranges) {
    const minOk = range.min === undefined || value >= range.min;
    const maxOk = range.max === undefined || value < range.max;
    if (minOk && maxOk) {
      return {
        label: range.label,
        tone: range.tone,
      };
    }
  }

  return {
    label: "Watch",
    tone: "neutral",
  };
}

export function deriveMetricStatus(metric) {
  const value = metric.latest?.value;
  if (!Number.isFinite(value)) {
    return {
      label: "Missing",
      tone: "neutral",
    };
  }

  switch (metric.key) {
    case "retailSales":
      return statusFromRange(value, [
        { min: 3, label: "Healthy", tone: "positive" },
        { min: 0, max: 3, label: "Caution", tone: "caution" },
        { max: 0, label: "Stress", tone: "negative" },
      ]);
    case "nonfarmPayrolls":
      return statusFromRange(value, [
        { min: 175, label: "Healthy", tone: "positive" },
        { min: 75, max: 175, label: "Caution", tone: "caution" },
        { max: 75, label: "Stress", tone: "negative" },
      ]);
    case "unemploymentRate":
      return statusFromRange(value, [
        { max: 4.2, label: "Healthy", tone: "positive" },
        { min: 4.2, max: 4.7, label: "Caution", tone: "caution" },
        { min: 4.7, label: "Stress", tone: "negative" },
      ]);
    case "initialClaims":
      return statusFromRange(value, [
        { max: 230, label: "Healthy", tone: "positive" },
        { min: 230, max: 260, label: "Caution", tone: "caution" },
        { min: 260, label: "Stress", tone: "negative" },
      ]);
    case "cpi":
    case "coreCpi":
    case "pce":
    case "corePce":
    case "coreServicesExHousing":
    case "wageGrowth":
      return statusFromRange(value, [
        { max: 2.6, label: "Healthy", tone: "positive" },
        { min: 2.6, max: 3.5, label: "Caution", tone: "caution" },
        { min: 3.5, label: "Stress", tone: "negative" },
      ]);
    case "effectiveFedFunds":
    case "treasury2y":
    case "treasury10y":
    case "treasury30y":
    case "real10y":
      return statusFromRange(value, [
        { max: 2.5, label: "Healthy", tone: "positive" },
        { min: 2.5, max: 4.5, label: "Caution", tone: "caution" },
        { min: 4.5, label: "Stress", tone: "negative" },
      ]);
    case "curve2s10s":
      return statusFromRange(value, [
        { min: 0, label: "Healthy", tone: "positive" },
        { min: -50, max: 0, label: "Caution", tone: "caution" },
        { max: -50, label: "Stress", tone: "negative" },
      ]);
    case "creditSpread":
      return statusFromRange(value, [
        { max: 1.4, label: "Healthy", tone: "positive" },
        { min: 1.4, max: 2, label: "Caution", tone: "caution" },
        { min: 2, label: "Stress", tone: "negative" },
      ]);
    case "dxyBroad":
      return statusFromRange(value, [
        { max: 117, label: "Healthy", tone: "positive" },
        { min: 117, max: 125, label: "Caution", tone: "caution" },
        { min: 125, label: "Stress", tone: "negative" },
      ]);
    case "breakeven10y":
      return statusFromRange(value, [
        { min: 2, max: 2.5, label: "Healthy", tone: "positive" },
        { min: 1.7, max: 2, label: "Caution", tone: "caution" },
        { min: 2.5, label: "Caution", tone: "caution" },
        { max: 1.7, label: "Stress", tone: "negative" },
      ]);
    default:
      return metric.importance === "high"
        ? { label: "Caution", tone: "caution" }
        : { label: "Watch", tone: "neutral" };
  }
}

export function deriveDisplaySignal(metric) {
  const value = metric.latest?.value;
  if (!Number.isFinite(value)) {
    return "Unavailable";
  }

  switch (metric.key) {
    case "retailSales":
      return value >= 3 ? "Consumer demand remains resilient" : value >= 0 ? "Consumer demand is cooling" : "Consumer demand is weakening";
    case "nonfarmPayrolls":
      return value >= 175 ? "Hiring remains strong" : value >= 75 ? "Hiring is cooling" : "Hiring is weakening";
    case "unemploymentRate":
      return value <= 4.2 ? "Labor market remains tight" : value <= 4.7 ? "Labor market is rebalancing" : "Unemployment pressure is rising";
    case "initialClaims":
      return value <= 230 ? "Layoff pressure remains low" : value <= 260 ? "Labor momentum is softening" : "Claims are flashing warning signs";
    case "ismManufacturing":
      return value >= 2 ? "Factory activity is expanding" : value >= 0 ? "Factory activity is stabilizing" : "Factory activity is contracting";
    case "cpi":
    case "coreCpi":
    case "pce":
    case "corePce":
    case "wageGrowth":
    case "coreServicesExHousing":
      return value <= 2.5 ? "Inflation is close to target" : value <= 3.5 ? "Inflation remains sticky" : "Inflation is running hot";
    case "creditSpread":
      return value <= 1.4 ? "Credit conditions are easy" : value <= 2 ? "Credit conditions are neutral" : "Credit conditions are tightening";
    case "dxyBroad":
      return value >= 125 ? "Dollar is strong" : value >= 117 ? "Dollar is firm" : "Dollar pressure is limited";
    case "curve2s10s":
      return value >= 0 ? "Curve has re-steepened" : value >= -50 ? "Curve remains mildly inverted" : "Curve remains deeply inverted";
    case "real10y":
      return value >= 2 ? "Real yields are restrictive" : value >= 1 ? "Real yields are neutral" : "Real yields are easing";
    case "treasury10y":
      return value >= 4.5 ? "Long-end yields are pressuring valuation" : value >= 4 ? "Long-end yields remain elevated" : "Long-end yields are easing";
    case "breakeven10y":
      return value >= 2.5 ? "Inflation expectations are heating up" : value >= 2 ? "Inflation expectations are stable" : "Inflation expectations are softening";
    default:
      return "Monitoring";
  }
}

function directionText(direction) {
  if (direction === "up") {
    return "Momentum is improving";
  }
  if (direction === "down") {
    return "Momentum is softening";
  }
  return "Momentum is unchanged";
}

function joinParts(parts) {
  return parts.filter(Boolean).join("; ");
}

function growthBrief(metric, changeDirection) {
  switch (metric.key) {
    case "retailSales":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 3 ? "consumer spending still supports growth" : "consumer demand is no longer accelerating"]);
    case "nonfarmPayrolls":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 175 ? "jobs growth still supports soft landing" : "hiring is no longer strong enough to ignore"]);
    case "unemploymentRate":
      return joinParts([directionText(changeDirection === "up" ? "down" : changeDirection === "down" ? "up" : "flat"), metric.latest?.value <= 4.2 ? "labor slack remains limited" : "labor slack is building"]);
    case "initialClaims":
      return joinParts([directionText(changeDirection === "up" ? "down" : changeDirection === "down" ? "up" : "flat"), metric.latest?.value <= 230 ? "layoff pressure remains contained" : "claims are now a visible warning light"]);
    case "housingStarts":
    case "existingHomeSales":
      return joinParts([directionText(changeDirection), "housing is still an important swing factor for cyclical growth"]);
    default:
      return joinParts([directionText(changeDirection), metric.marketSignal]);
  }
}

function inflationBrief(metric, changeDirection) {
  switch (metric.key) {
    case "cpi":
    case "coreCpi":
    case "pce":
    case "corePce":
      return joinParts([directionText(changeDirection), metric.latest?.value <= 2.6 ? "disinflation is getting closer to the Fed's comfort zone" : "higher-for-longer risk is still alive"]);
    case "wageGrowth":
      return joinParts([directionText(changeDirection), metric.latest?.value <= 3.5 ? "wage pressure is easing" : "services inflation pressure still matters"]);
    case "effectiveFedFunds":
      return "The policy rate changes slowly; what matters most is whether inflation and labor data are making policy more or less restrictive.";
    default:
      return joinParts([directionText(changeDirection), metric.marketSignal]);
  }
}

function ratesBrief(metric, changeDirection) {
  switch (metric.key) {
    case "treasury10y":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 4.5 ? "discount-rate pressure on equities remains high" : "valuation pressure is moderating"]);
    case "real10y":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 2 ? "real-rate pressure is unfriendly for long-duration assets" : "real-rate pressure is easing"]);
    case "curve2s10s":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 0 ? "curve re-steepening fits better with reflation than recession panic" : "remaining inversion still warns on growth"]);
    case "creditSpread":
      return joinParts([directionText(changeDirection), metric.latest?.value <= 1.4 ? "credit still supports risk appetite" : "credit conditions are becoming less friendly"]);
    case "dxyBroad":
      return joinParts([directionText(changeDirection), metric.latest?.value >= 125 ? "a stronger dollar would tighten global financial conditions" : "dollar pressure is manageable"]);
    default:
      return joinParts([directionText(changeDirection), metric.marketSignal]);
  }
}

function formatQuarter(date) {
  const [yearText, monthText] = date.split("-");
  const quarter = Math.floor((Number(monthText) - 1) / 3) + 1;
  return `${yearText}-Q${quarter}`;
}

export function formatMetricAsOf(metric) {
  const date = metric.latest?.date;
  if (!date) {
    return "N/A";
  }

  if (metric.frequency === "monthly") {
    return date.slice(0, 7);
  }

  if (metric.frequency === "quarterly") {
    return formatQuarter(date);
  }

  if (metric.frequency === "yearly") {
    return date.slice(0, 4);
  }

  return date;
}

export function metricAgeDays(metric, referenceDate = new Date()) {
  const dateText = metric.latest?.date;
  if (!dateText) {
    return Number.POSITIVE_INFINITY;
  }

  const latestDate = new Date(`${dateText}T00:00:00Z`);
  const diffMs = referenceDate.getTime() - latestDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function isMetricStale(metric, referenceDate = new Date()) {
  const threshold = staleThresholdDays[metric.frequency] ?? 90;
  return metricAgeDays(metric, referenceDate) > threshold;
}

export function buildMetricFreshnessWarning(metric) {
  if (!isMetricStale(metric)) {
    return null;
  }

  return `${metric.label} is stale. Latest observation is ${formatMetricAsOf(metric)} (${metric.frequencyLabel ?? metric.frequency}).`;
}

export function deriveMetricBrief(metric) {
  const change = formatMetricChange(metric);
  if (metric.group === "growthLabor") {
    return growthBrief(metric, change.direction);
  }
  if (metric.group === "inflationFed") {
    return inflationBrief(metric, change.direction);
  }
  return ratesBrief(metric, change.direction);
}

export function serializeMetricForTable(metric) {
  const status = deriveMetricStatus(metric);
  const change = formatMetricChange(metric);
  const frequencyLabel = frequencyLabels[metric.frequency] ?? metric.frequency ?? "N/A";

  return {
    key: metric.key,
    label: metric.label,
    category: metric.category,
    group: metric.group,
    sourceLabel: metric.sourceLabel ?? metric.source ?? "Unknown",
    definition: metric.definition ?? "Level",
    unit: metric.unit,
    frequency: metric.frequency,
    frequencyLabel,
    importance: metric.importance,
    marketSignal: deriveDisplaySignal(metric),
    latest: metric.latest,
    previous: metric.previous,
    change: metric.change,
    history: metric.history,
    valueText: formatMetricValue(metric),
    changeText: change.text,
    changeDirection: change.direction,
    asOfText: formatMetricAsOf(metric),
    isStale: isMetricStale({ ...metric, frequencyLabel }),
    statusLabel: status.label,
    statusTone: status.tone,
    brief: deriveMetricBrief(metric),
  };
}

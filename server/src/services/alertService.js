import crypto from "node:crypto";

function buildId(prefix, fingerprint) {
  return `${prefix}-${crypto.createHash("sha1").update(fingerprint).digest("hex").slice(0, 12)}`;
}

function severityFromImportance(importance) {
  if (importance === "high") {
    return "high";
  }
  if (importance === "medium") {
    return "medium";
  }
  return "low";
}

export function buildMetricAlerts(previousLatestMap, currentMetrics) {
  const alerts = [];

  for (const metric of currentMetrics) {
    if (!metric.latest) {
      continue;
    }

    const previousInDb = previousLatestMap[metric.key];
    const threshold = metric.alertThreshold ?? Infinity;
    const latestDate = metric.latest.date;

    if (!previousInDb || previousInDb.date !== latestDate) {
      const fingerprint = `metric-release:${metric.key}:${latestDate}`;
      alerts.push({
        alertId: buildId("metric", fingerprint),
        fingerprint,
        createdAt: new Date().toISOString(),
        alertType: "data_release",
        severity: severityFromImportance(metric.importance),
        title: `${metric.label} 更新`,
        body: `${metric.label} 发布了新值 ${metric.latest.value}${metric.unit ? ` ${metric.unit}` : ""}，当前解读为“${metric.marketSignal}”。`,
        impactedAssets: metric.group === "ratesFinancial" ? ["估值", "美元", "风格"] : ["增长", "Fed", "美股"],
        metadata: {
          metricKey: metric.key,
          observationDate: latestDate,
          change: metric.change,
        },
      });
      continue;
    }

    if (Number.isFinite(metric.change) && Math.abs(metric.change) >= threshold) {
      const fingerprint = `metric-threshold:${metric.key}:${latestDate}:${metric.change}`;
      alerts.push({
        alertId: buildId("metric", fingerprint),
        fingerprint,
        createdAt: new Date().toISOString(),
        alertType: "threshold_change",
        severity: severityFromImportance(metric.importance),
        title: `${metric.label} 触发阈值提醒`,
        body: `${metric.label} 相比上期变化 ${metric.change}${metric.unit ? ` ${metric.unit}` : ""}`,
        impactedAssets: metric.group === "inflationFed" ? ["Fed", "利率", "成长股"] : ["宏观节奏", "行业风格"],
        metadata: {
          metricKey: metric.key,
          observationDate: latestDate,
          change: metric.change,
        },
      });
    }
  }

  return alerts;
}

export function buildRegimeAlerts(previousRegime, currentRegime) {
  if (!previousRegime || previousRegime.regime === currentRegime.regime) {
    return [];
  }

  const fingerprint = `regime:${previousRegime.regime}->${currentRegime.regime}:${currentRegime.asOf.slice(0, 10)}`;
  return [
    {
      alertId: buildId("regime", fingerprint),
      fingerprint,
      createdAt: new Date().toISOString(),
      alertType: "regime_shift",
      severity: "high",
      title: `Macro regime 切换到 ${currentRegime.regime}`,
      body: `上一状态是 ${previousRegime.regime}，当前转向 ${currentRegime.regime}。${currentRegime.summary}`,
      impactedAssets: ["利率", "美元", "盈利", "估值", "行业风格"],
      metadata: {
        from: previousRegime.regime,
        to: currentRegime.regime,
      },
    },
  ];
}

function metricValue(metrics, key) {
  return metrics[key]?.latest?.value ?? null;
}

function pushIfPresent(list, condition, text) {
  if (condition) {
    list.push(text);
  }
}

function creditDriverLabel(creditSpread) {
  if (!Number.isFinite(creditSpread)) {
    return "信用条件待确认";
  }
  if (creditSpread <= 0.9) {
    return `信用利差 ${creditSpread}% | 信用非常宽松`;
  }
  if (creditSpread <= 1.3) {
    return `信用利差 ${creditSpread}% | 信用仍偏宽松`;
  }
  if (creditSpread <= 1.8) {
    return `信用利差 ${creditSpread}% | 信用中性`;
  }
  return `信用利差 ${creditSpread}% | 信用开始收紧`;
}

function implicationMap(regime) {
  return {
    Goldilocks: [
      "利率有温和下行空间，估值扩张更容易发生。",
      "成长与优质周期股通常都能受益。",
      "Fed 更接近预防式宽松，而不是衰退式救火。",
    ],
    Reflation: [
      "名义增长偏强，但长端利率和美元可能抬升。",
      "Value、energy、financials 通常相对更占优。",
      "高估值长久期资产更容易承压。",
    ],
    Recession: [
      "降息预期会升温，但市场更先交易盈利下修风险。",
      "防御、quality 与现金流确定性会更重要。",
      "信用利差和失业数据是关键确认项。",
    ],
    Stagflation: [
      "增长走弱但通胀顽固，对股债都不友好。",
      "Fed 容易陷入两难，估值与盈利会同时承压。",
      "防御仓位与资产负债表质量更重要。",
    ],
  }[regime];
}

function summaryMap(regime) {
  return {
    Goldilocks: "增长仍稳而通胀继续回落，市场更容易演绎 soft landing。",
    Reflation: "增长韧性与通胀黏性并存，higher for longer 风险抬头。",
    Recession: "增长信号明显走弱，后续焦点转向盈利下修与宽松节奏。",
    Stagflation: "增长和通胀方向错配，Fed 与市场都面临更难的权衡。",
  }[regime];
}

export function deriveRegime(metrics) {
  const growthDrivers = [];
  const inflationDrivers = [];
  const creditDrivers = [];

  const payrolls = metricValue(metrics, "nonfarmPayrolls");
  const unemployment = metricValue(metrics, "unemploymentRate");
  const claims = metricValue(metrics, "initialClaims");
  const retailSales = metricValue(metrics, "retailSales");
  const manufacturing = metricValue(metrics, "ismManufacturing");
  const housing = metricValue(metrics, "housingStarts");

  let growthScore = 0;
  if (Number.isFinite(payrolls)) {
    growthScore += payrolls >= 175 ? 1.2 : payrolls >= 75 ? 0.3 : -1.1;
    pushIfPresent(growthDrivers, true, `非农月增 ${payrolls}K`);
  }
  if (Number.isFinite(unemployment)) {
    growthScore += unemployment <= 4.2 ? 1 : unemployment <= 4.7 ? 0 : -1;
    pushIfPresent(growthDrivers, true, `失业率 ${unemployment}%`);
  }
  if (Number.isFinite(claims)) {
    growthScore += claims <= 230 ? 0.8 : claims <= 260 ? 0 : -0.8;
    pushIfPresent(growthDrivers, true, `初请 ${claims}K`);
  }
  if (Number.isFinite(retailSales)) {
    growthScore += retailSales >= 3 ? 0.9 : retailSales >= 0 ? 0.2 : -0.8;
    pushIfPresent(growthDrivers, true, `零售销售同比 ${retailSales}%`);
  }
  if (Number.isFinite(manufacturing)) {
    growthScore += manufacturing >= 2 ? 0.7 : manufacturing >= 0 ? 0 : -0.7;
    pushIfPresent(growthDrivers, true, `制造业产出同比 ${manufacturing}%`);
  }
  if (Number.isFinite(housing)) {
    growthScore += housing >= 1300 ? 0.4 : housing >= 1100 ? 0 : -0.4;
  }

  const cpi = metricValue(metrics, "cpi");
  const corePce = metricValue(metrics, "corePce");
  const wageGrowth = metricValue(metrics, "wageGrowth");
  const services = metricValue(metrics, "coreServicesExHousing");
  const real10y = metricValue(metrics, "real10y");

  let inflationScore = 0;
  if (Number.isFinite(cpi)) {
    inflationScore += cpi <= 2.5 ? -0.7 : cpi <= 3.2 ? 0 : 0.9;
    pushIfPresent(inflationDrivers, true, `CPI 同比 ${cpi}%`);
  }
  if (Number.isFinite(corePce)) {
    inflationScore += corePce <= 2.5 ? -1 : corePce <= 3 ? 0 : 1;
    pushIfPresent(inflationDrivers, true, `Core PCE 同比 ${corePce}%`);
  }
  if (Number.isFinite(wageGrowth)) {
    inflationScore += wageGrowth <= 3.5 ? -0.4 : wageGrowth <= 4.2 ? 0.2 : 0.8;
    pushIfPresent(inflationDrivers, true, `工资增速 ${wageGrowth}%`);
  }
  if (Number.isFinite(services)) {
    inflationScore += services <= 3.5 ? -0.2 : services <= 4.5 ? 0.2 : 0.6;
    pushIfPresent(inflationDrivers, true, `服务通胀 ${services}%`);
  }
  if (Number.isFinite(real10y)) {
    inflationScore += real10y >= 2 ? 0.2 : 0;
  }

  const creditSpread = metricValue(metrics, "creditSpread");
  const dxy = metricValue(metrics, "dxyBroad");
  const curve = metricValue(metrics, "curve2s10s");

  let creditScore = 0;
  if (Number.isFinite(creditSpread)) {
    creditScore += creditSpread <= 0.9 ? 1.2 : creditSpread <= 1.3 ? 0.8 : creditSpread <= 1.8 ? 0 : -1;
    pushIfPresent(creditDrivers, true, creditDriverLabel(creditSpread));
  }
  if (Number.isFinite(dxy)) {
    creditScore += dxy <= 119 ? 0.2 : dxy <= 123 ? 0 : -0.2;
  }
  if (Number.isFinite(curve)) {
    creditScore += curve >= 0 ? 0.2 : 0;
  }

  let regime = "Goldilocks";
  if (growthScore >= 0 && inflationScore > 0.5) {
    regime = "Reflation";
  } else if (growthScore < 0 && inflationScore <= 0.5) {
    regime = "Recession";
  } else if (growthScore < 0 && inflationScore > 0.5) {
    regime = "Stagflation";
  }

  const confidence = Math.min(
    0.95,
    Math.max(0.35, 0.45 + (Math.abs(growthScore) + Math.abs(inflationScore) + Math.abs(creditScore)) / 12),
  );

  return {
    asOf: new Date().toISOString(),
    regime,
    confidence: Number(confidence.toFixed(2)),
    summary: summaryMap(regime),
    drivers: [...growthDrivers.slice(0, 3), ...inflationDrivers.slice(0, 2), ...creditDrivers.slice(0, 1)],
    implications: implicationMap(regime),
    scores: {
      growth: Number(growthScore.toFixed(2)),
      inflation: Number(inflationScore.toFixed(2)),
      credit: Number(creditScore.toFixed(2)),
    },
  };
}

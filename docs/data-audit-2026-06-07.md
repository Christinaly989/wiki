# Macro Dashboard Data Audit

Audit date: `2026-06-07`

Purpose: lock down the latest observation period and expected display value for every metric currently shown in the dashboard.

## Notes

- `Value` is the number the dashboard should display in the `Value` column.
- `As Of` is the latest observation period/date that should display in the `As Of` column.
- `Dashboard Formula` matters because several rows are derived metrics, not raw levels.
- Market series can have a different latest date from macro series; that is expected and should remain visible in the UI.

## Growth & Labor

| Metric | Dashboard Formula | As Of | Expected Value | Cross-check |
| --- | --- | --- | --- | --- |
| Retail Sales YoY | FRED `RSAFS` year-over-year percent change | `2026-04` | `4.9%` | U.S. Census, Advance Monthly Retail Sales for April 2026 |
| Nonfarm Payrolls MoM | FRED `PAYEMS` month-over-month level change | `2026-05` | `172K` | BLS Employment Situation, May 2026 |
| Unemployment Rate | FRED `UNRATE` latest level | `2026-05` | `4.3%` | BLS Employment Situation, May 2026 |
| Initial Jobless Claims | FRED `ICSA` latest level scaled to thousands | `2026-05-30` | `225 K` | DOL UI Weekly Claims Report released June 4, 2026 |
| JOLTS Openings | FRED `JTSJOL` latest level | `2026-04` | `7,618 K` | BLS JOLTS latest numbers |
| Housing Starts | FRED `HOUST` latest level | `2026-04` | `1,465 K` | Census New Residential Construction, April 2026 |
| Existing Home Sales | FRED `EXHOSLUSM495S` latest level scaled to millions | `2026-04` | `4.02 M` | NAR Existing-Home Sales, April 2026 |
| Manufacturing Output YoY | FRED `IPMAN` year-over-year percent change | `2026-04` | `1.3%` | Federal Reserve G.17, Manufacturing Apr. '25 to Apr. '26 |
| Industrial Production YoY | FRED `INDPRO` year-over-year percent change | `2026-04` | `1.4%` | Federal Reserve G.17, Total index Apr. '25 to Apr. '26 |

## Inflation & Fed

| Metric | Dashboard Formula | As Of | Expected Value | Cross-check |
| --- | --- | --- | --- | --- |
| Headline CPI YoY | FRED `CPIAUCSL` year-over-year percent change | `2026-04` | `3.8%` | BLS CPI April 2026 |
| Core CPI YoY | FRED `CPILFESL` year-over-year percent change | `2026-04` | `2.8%` | BLS CPI April 2026, all items less food and energy |
| Headline PCE YoY | FRED `PCEPI` year-over-year percent change | `2026-04` | `3.8%` | BEA Personal Income and Outlays, April 2026 |
| Core PCE YoY | FRED `PCEPILFE` year-over-year percent change | `2026-04` | `3.3%` | BEA Personal Income and Outlays, April 2026 |
| Shelter CPI YoY | FRED `CUSR0000SAH1` year-over-year percent change | `2026-04` | `3.3%` | BLS CPI April 2026, shelter |
| Services Less Rent of Shelter YoY | FRED `CUSR0000SASL2RS` year-over-year percent change | `2026-04` | `3.5%` | BLS CPI April 2026, services less rent of shelter |
| Average Hourly Earnings YoY | FRED `CES0500000003` year-over-year percent change | `2026-05` | `3.44%` | Calculated from BLS Table B-3: `37.53 / 36.28 - 1` |
| Effective Fed Funds | FRED `DFF` latest level | `2026-06-04` | `3.62%` | Federal Reserve H.15 / New York Fed |

## Rates & Financial Conditions

| Metric | Dashboard Formula | As Of | Expected Value | Cross-check |
| --- | --- | --- | --- | --- |
| 2Y Treasury | Treasury latest level | `2026-06-04` | `4.05%` | Federal Reserve H.15 sourced from U.S. Treasury |
| 10Y Treasury | Treasury latest level | `2026-06-04` | `4.47%` | Federal Reserve H.15 sourced from U.S. Treasury |
| 30Y Treasury | Treasury latest level | `2026-06-04` | `4.97%` | Federal Reserve H.15 sourced from U.S. Treasury |
| 2s10s Curve | `(10Y - 2Y) * 100` | `2026-06-04` | `42 bp` | Derived from Treasury 10Y and 2Y |
| 10Y Real Yield | Treasury TIPS latest level | `2026-06-04` | `2.11%` | Federal Reserve H.15 sourced from U.S. Treasury |
| 10Y Breakeven | `10Y nominal - 10Y real` | `2026-06-04` | `2.36%` | Derived from Treasury nominal and real yields |
| Broad Dollar Index | FRED `DTWEXBGS` latest level | `2026-05-29` | `118.8783` | Federal Reserve H.10 / FRED |
| US Corporate OAS | FRED `BAMLC0A0CM` latest level | `2026-06-04` | `0.74%` | ICE BofA via FRED |
| S&P 500 | FRED `SP500` latest close | `2026-06-04` | `7,584.31` | S&P DJI via FRED |

## Implementation checkpoints

- `UNRATE` must remain an unscaled level series.
- CPI year-over-year rows should use the NSA series family so they match the official BLS 12-month change convention.
- `EXHOSLUSM495S` must be scaled from raw units to millions.
- `coreServicesExHousing` must use `CUUR0000SASL2RS`, not the prior shelter-adjacent proxy.
- `/api/dashboard` should attempt a fresh pull before serving cached data when the cache is stale or old.
- UI must always show `As Of` next to every metric because the release periods are intentionally different.

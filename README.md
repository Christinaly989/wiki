# Macro Regime Dashboard

一个面向个人研究的美国宏观看板。前端使用 `React + Vite`，后端使用 `Node + Express`，默认输出北京时间视角，并支持 Notion 日报与 DeepSeek 深度分析叠加。

## 快速开始

1. 复制 `.env.example` 为 `.env`
2. 至少填写 `FRED_API_KEY`
3. 如需 Notion 日报，填写 `NOTION_API_KEY` 与 `NOTION_DATA_SOURCE_ID`
4. 如需 DeepSeek 分析，填写 `DEEPSEEK_API_KEY`
5. 运行 `npm run dev`
6. 打开 `http://localhost:5173`

## 常用命令

- `npm run dev`
  - 本地前后端联调
- `npm run build`
  - 构建前端
- `npm start`
  - 启动后端，并在已构建前端时直接托管网页
- `npm run check:live`
  - 用真实配置跑一次 live refresh
- `npm run refresh:cache`
  - 刷新一次数据并生成 `server/data/render-cache.json`
- `npm run build:bundles`
  - 重建 `source-bundle/*.json` 与 `source-bundle/*.b64`

## Refresh Policy

- `GitHub Actions + Render` 是线上页面的主刷新链路。
- `npm run check:live` 是人工手动补刷/排查入口。
- 不再使用 `Codex` 内部的 `7:00 AM` 自动刷新线程，因为该环境可能受沙箱网络限制，容易产生误报。
- 如果 `Codex` 线程里出现 `fetch failed`，应先用真实本机 shell 复核，不要直接把它视为 FRED / Treasury / Notion 的真实故障。

## 免费版 Render 部署

免费版建议只部署一个 `Web Service`，不要依赖 Render 的 cron job 或 persistent disk。

推荐配置：

- `Build Command`
  - `node scripts/restore-source.mjs && npm install && npm --prefix client install && npm run build`
- `Start Command`
  - `node scripts/restore-source.mjs && npm start`
- `Instance Type`
  - `Free`

推荐环境变量：

```env
PORT=10000
APP_TIMEZONE=Asia/Shanghai
POLL_INTERVAL_MINUTES=0
FRED_API_KEY=...
NOTION_API_KEY=...
NOTION_DATA_SOURCE_ID=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REASONING_EFFORT=max
DEEPSEEK_TIMEOUT_MS=45000
```

## 免费版补救方案

免费版没有持久磁盘，也不能免费使用 Render cron。这个仓库已经做了两个补救：

1. `server/data/render-cache.json`
   - 每次成功刷新后都会写入一个可提交的快照文件
   - 应用在本地 SQLite 不可用或为空时，会自动回退到这个快照
2. `.github/workflows/render-free-refresh.yml`
   - GitHub Actions 每天 `23:00 UTC` 运行
   - 等价于北京时间每天早上 `07:00`
   - 它会刷新缓存、重建 `source-bundle`，并把最新缓存提交回仓库
   - Render 检测到仓库更新后会自动重新部署

## GitHub Actions 需要的 Secrets

在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 里添加：

- `FRED_API_KEY`
- `NOTION_API_KEY`
- `NOTION_DATA_SOURCE_ID`
- `NOTION_VERSION`
  - 可填 `2026-03-11`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
  - 可填 `https://api.deepseek.com`
- `DEEPSEEK_MODEL`
  - 可填 `deepseek-v4-pro`
- `DEEPSEEK_REASONING_EFFORT`
  - 可填 `max`
- `DEEPSEEK_TIMEOUT_MS`
  - 可填 `45000`

## Notion 行为

- 每天写入一个新的 database item
- 同一天内重复刷新时，更新当天 item 的属性
- 若 Notion 同步失败，系统会保留本地 fallback markdown 路径

## 说明

- 免费版 Render 休眠后再次唤醒会变慢，这是平台限制
- 免费版不保证服务实例上的本地文件长期保留，所以不要把 SQLite 当作唯一真源
- 线上网页的稳态来源应视为：
  - 最新 live fetch 成功时的实时数据
  - 或 GitHub Actions 最近一次写回仓库的 `render-cache.json`

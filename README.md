# Macro Regime Dashboard

A local-first U.S. macro monitoring dashboard with:

- React + Vite frontend
- Node + Express backend
- SQLite snapshots and release calendar cache
- DeepSeek overlay for regime and news commentary
- Notion daily publishing

## Local Run

1. Copy `.env.example` to `.env`
2. Fill `FRED_API_KEY`
3. Optionally fill `NOTION_API_KEY`, `NOTION_DATA_SOURCE_ID`, and `DEEPSEEK_API_KEY`
4. Run `npm run dev`
5. Open `http://localhost:5173`

## Render Blueprint

This repo includes `render.yaml` for Render deployment.

- Web service serves the dashboard
- Persistent disk is mounted at `/var/data`
- Daily refresh cron runs at `07:00` Asia/Shanghai
- Cron refreshes the live service through `/api/refresh`

## Required Environment Variables

```env
FRED_API_KEY=...
NOTION_API_KEY=...
NOTION_DATA_SOURCE_ID=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REASONING_EFFORT=max
DEEPSEEK_TIMEOUT_MS=45000
APP_TIMEZONE=Asia/Shanghai
DATA_DIR=/var/data
POLL_INTERVAL_MINUTES=0
REFRESH_URL=https://your-render-service.onrender.com/api/refresh
REFRESH_TIMEOUT_MS=120000
```

## Notes

The current workspace already contains the full application source. This repository is being prepared for hosted deployment and daily refresh automation.
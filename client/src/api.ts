import type { DashboardPayload } from "./types"

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

  return (await response.json()) as DashboardPayload
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

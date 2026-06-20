import fs from "node:fs";
import path from "node:path";

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readDashboardCache(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeDashboardCache(filePath, payload) {
  if (!filePath || !payload) {
    return null;
  }

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function annotateCachedDashboard(payload, warningPrefix = []) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    warnings: [...warningPrefix, ...(payload.warnings ?? [])],
  };
}

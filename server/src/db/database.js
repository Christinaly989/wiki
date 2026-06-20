import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function withTransaction(db, work) {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createDatabase(filePath) {
  ensureDir(filePath);
  const db = new DatabaseSync(filePath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      series_key TEXT NOT NULL,
      label TEXT NOT NULL,
      group_key TEXT NOT NULL,
      category TEXT,
      observation_date TEXT NOT NULL,
      raw_value REAL,
      derived_value REAL,
      unit TEXT,
      frequency TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(series_key, observation_date)
    );

    CREATE TABLE IF NOT EXISTS regime_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      as_of TEXT NOT NULL,
      regime TEXT NOT NULL,
      confidence REAL NOT NULL,
      summary TEXT NOT NULL,
      drivers_json TEXT NOT NULL,
      implications_json TEXT NOT NULL,
      score_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS release_events (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      release_at_utc TEXT NOT NULL,
      release_at_local TEXT NOT NULL,
      importance TEXT NOT NULL,
      impact TEXT,
      tags_json TEXT,
      related_series_json TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      alert_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      impacted_assets_json TEXT,
      email_sent_at TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertObservation = db.prepare(`
    INSERT INTO observations (
      source, series_key, label, group_key, category, observation_date, raw_value, derived_value, unit, frequency, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(series_key, observation_date) DO UPDATE SET
      raw_value = excluded.raw_value,
      derived_value = excluded.derived_value,
      metadata_json = excluded.metadata_json
  `);

  const insertRelease = db.prepare(`
    INSERT INTO release_events (
      event_id, source, name, release_at_utc, release_at_local, importance, impact, tags_json, related_series_json, notes, status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      name = excluded.name,
      release_at_utc = excluded.release_at_utc,
      release_at_local = excluded.release_at_local,
      importance = excluded.importance,
      impact = excluded.impact,
      tags_json = excluded.tags_json,
      related_series_json = excluded.related_series_json,
      notes = excluded.notes,
      status = excluded.status,
      metadata_json = excluded.metadata_json
  `);

  const insertRegime = db.prepare(`
    INSERT INTO regime_snapshots (as_of, regime, confidence, summary, drivers_json, implications_json, score_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlert = db.prepare(`
    INSERT OR IGNORE INTO alerts (
      alert_id, fingerprint, created_at, alert_type, severity, title, body, impacted_assets_json, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const markAlertEmailed = db.prepare(`
    UPDATE alerts SET email_sent_at = ? WHERE alert_id = ?
  `);

  const upsertState = db.prepare(`
    INSERT INTO state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  return {
    raw: db,
    saveMetricHistory(metrics) {
      withTransaction(db, () => {
        for (const metric of metrics) {
          for (const point of metric.history) {
            insertObservation.run(
              metric.source,
              metric.key,
              metric.label,
              metric.group,
              metric.category,
              point.date,
              point.rawValue ?? point.value,
              point.value,
              metric.unit,
              metric.frequency,
              JSON.stringify({
                importance: metric.importance,
                signal: point.signal ?? metric.marketSignal,
                definition: metric.definition ?? null,
                sourceLabel: metric.sourceLabel ?? metric.source ?? null,
              }),
            );
          }
        }
      });
    },
    saveReleases(events) {
      withTransaction(db, () => {
        for (const event of events) {
          insertRelease.run(
            event.eventId,
            event.source,
            event.name,
            event.releaseAtUtc,
            event.releaseAtLocal,
            event.importance,
            event.impact,
            JSON.stringify(event.tags ?? []),
            JSON.stringify(event.relatedSeries ?? []),
            event.notes ?? "",
            event.status ?? "scheduled",
            JSON.stringify(event.metadata ?? {}),
          );
        }
      });
    },
    saveRegime(regimeState) {
      insertRegime.run(
        regimeState.asOf,
        regimeState.regime,
        regimeState.confidence,
        regimeState.summary,
        JSON.stringify(regimeState.drivers),
        JSON.stringify(regimeState.implications),
        JSON.stringify(regimeState.scores),
      );
    },
    saveAlerts(alerts) {
      withTransaction(db, () => {
        for (const alert of alerts) {
          insertAlert.run(
            alert.alertId,
            alert.fingerprint,
            alert.createdAt,
            alert.alertType,
            alert.severity,
            alert.title,
            alert.body,
            JSON.stringify(alert.impactedAssets ?? []),
            JSON.stringify(alert.metadata ?? {}),
          );
        }
      });
    },
    getLatestMetricMap() {
      const rows = db
        .prepare(`
          SELECT o.*
          FROM observations o
          INNER JOIN (
            SELECT series_key, MAX(observation_date) AS max_date
            FROM observations
            GROUP BY series_key
          ) latest
            ON latest.series_key = o.series_key
           AND latest.max_date = o.observation_date
          ORDER BY o.series_key
        `)
        .all();

      return Object.fromEntries(
        rows.map((row) => {
          const metadata = parseJson(row.metadata_json, {});
          return [
            row.series_key,
            {
              key: row.series_key,
              label: row.label,
              group: row.group_key,
              category: row.category,
              date: row.observation_date,
              value: row.derived_value,
              rawValue: row.raw_value,
              unit: row.unit,
              frequency: row.frequency,
              metadata,
              sourceLabel: metadata.sourceLabel ?? row.source,
              definition: metadata.definition ?? null,
            },
          ];
        }),
      );
    },
    getMetricHistory() {
      const rows = db
        .prepare(`
          SELECT *
          FROM observations
          ORDER BY series_key ASC, observation_date DESC
        `)
        .all();

      const grouped = new Map();
      for (const row of rows) {
        const current = grouped.get(row.series_key) ?? [];
        if (current.length < 36) {
          current.push({
            date: row.observation_date,
            value: row.derived_value,
            rawValue: row.raw_value,
          });
          grouped.set(row.series_key, current);
        }
      }
      return grouped;
    },
    getLatestRegime() {
      const row = db
        .prepare(`
          SELECT *
          FROM regime_snapshots
          ORDER BY as_of DESC, id DESC
          LIMIT 1
        `)
        .get();
      if (!row) {
        return null;
      }
      return {
        asOf: row.as_of,
        regime: row.regime,
        confidence: row.confidence,
        summary: row.summary,
        drivers: parseJson(row.drivers_json, []),
        implications: parseJson(row.implications_json, []),
        scores: parseJson(row.score_json, {}),
      };
    },
    getUpcomingReleases(days) {
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + days);
      const rows = db
        .prepare(`
          SELECT *
          FROM release_events
          WHERE release_at_utc >= ?
            AND release_at_utc <= ?
          ORDER BY release_at_utc ASC
        `)
        .all(new Date().toISOString(), until.toISOString());

      return rows.map((row) => ({
        eventId: row.event_id,
        source: row.source,
        name: row.name,
        releaseAtUtc: row.release_at_utc,
        releaseAtLocal: row.release_at_local,
        importance: row.importance,
        impact: row.impact,
        tags: parseJson(row.tags_json, []),
        relatedSeries: parseJson(row.related_series_json, []),
        notes: row.notes,
        status: row.status,
        metadata: parseJson(row.metadata_json, {}),
      }));
    },
    getRecentAlerts(limit = 20) {
      const rows = db
        .prepare(`
          SELECT *
          FROM alerts
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .all(limit);
      return rows.map((row) => ({
        alertId: row.alert_id,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
        alertType: row.alert_type,
        severity: row.severity,
        title: row.title,
        body: row.body,
        impactedAssets: parseJson(row.impacted_assets_json, []),
        emailSentAt: row.email_sent_at,
        metadata: parseJson(row.metadata_json, {}),
      }));
    },
    getPendingAlerts() {
      const rows = db
        .prepare(`
          SELECT *
          FROM alerts
          WHERE email_sent_at IS NULL
          ORDER BY created_at ASC
        `)
        .all();
      return rows.map((row) => ({
        alertId: row.alert_id,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
        alertType: row.alert_type,
        severity: row.severity,
        title: row.title,
        body: row.body,
        impactedAssets: parseJson(row.impacted_assets_json, []),
        metadata: parseJson(row.metadata_json, {}),
      }));
    },
    markAlertsEmailed(alertIds, sentAt) {
      withTransaction(db, () => {
        for (const id of alertIds) {
          markAlertEmailed.run(sentAt, id);
        }
      });
    },
    getState(key) {
      const row = db.prepare(`SELECT value FROM state WHERE key = ?`).get(key);
      return row?.value ?? null;
    },
    setState(key, value) {
      upsertState.run(key, value);
    },
  };
}

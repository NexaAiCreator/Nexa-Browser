const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const MAX_HISTORY_ITEMS = 120;
const MAX_DOWNLOAD_ITEMS = 60;
const MAX_BOOKMARKS = 18;
const DEFAULT_SETTINGS = {
  homepage: "nexa://start",
  searchEngine: "https://www.google.com/search?q=%s",
  startBackground: "aurora",
  restoreLastSession: true
};
const DEFAULT_SPEED_DIALS = [
  { title: "YouTube", url: "https://www.youtube.com", accent: "#ef4444" },
  { title: "GitHub", url: "https://github.com", accent: "#0f172a" },
  { title: "OpenAI", url: "https://openai.com", accent: "#10b981" },
  { title: "Gmail", url: "https://mail.google.com", accent: "#2563eb" },
  { title: "X", url: "https://x.com", accent: "#111827" },
  { title: "Wikipedia", url: "https://www.wikipedia.org", accent: "#4b5563" }
];
const DEFAULT_AI_PERMISSIONS = {
  current_page: false,
  selected_text: false,
  open_tabs: false,
  browsing_history: false,
  bookmarks: false,
  downloads: false
};
const SHUTDOWN_STATE_KEY = "last_shutdown_clean";

class BrowserDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.prepareSchema();
    this.seedDefaults();
    this.migrateLegacyJson();
  }

  prepareSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        accent TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS speed_dials (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        accent TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history_entries (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        visited_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        save_path TEXT,
        received_bytes INTEGER NOT NULL,
        total_bytes INTEGER NOT NULL,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_permissions (
        scope TEXT PRIMARY KEY,
        allowed INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_tabs (
        session_name TEXT NOT NULL,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (session_name, position)
      );

      CREATE TABLE IF NOT EXISTS brain_runs (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        intent TEXT,
        status TEXT NOT NULL,
        plan TEXT,
        workflow_id TEXT,
        clarifications TEXT,
        answers TEXT,
        required_permissions TEXT,
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  seedDefaults() {
    const insertSetting = this.db.prepare(`
      INSERT INTO app_settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO NOTHING
    `);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, JSON.stringify(value));
    }

    const countSpeedDials = this.db.prepare("SELECT COUNT(*) AS total FROM speed_dials").get().total;
    if (countSpeedDials === 0) {
      const insertDial = this.db.prepare(`
        INSERT INTO speed_dials(url, title, accent, position, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const createdAt = new Date().toISOString();
      DEFAULT_SPEED_DIALS.forEach((item, index) => {
        insertDial.run(item.url, item.title, item.accent, index, createdAt);
      });
    }

    const insertPermission = this.db.prepare(`
      INSERT INTO ai_permissions(scope, allowed, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO NOTHING
    `);
    const updatedAt = new Date().toISOString();
    for (const [scope, allowed] of Object.entries(DEFAULT_AI_PERMISSIONS)) {
      insertPermission.run(scope, allowed ? 1 : 0, updatedAt);
    }
  }

  migrateLegacyJson() {
    const legacyPath = path.join(path.dirname(this.dbPath), "browser-state.json");
    if (!fs.existsSync(legacyPath)) {
      return;
    }

    const migratedFlag = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get("legacy_json_migrated");
    if (migratedFlag?.value) {
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
      if (Array.isArray(parsed.bookmarks)) {
        parsed.bookmarks.slice(0, MAX_BOOKMARKS).forEach((bookmark) => this.upsertBookmark(bookmark));
      }
      if (Array.isArray(parsed.speedDials) && parsed.speedDials.length) {
        this.db.prepare("DELETE FROM speed_dials").run();
        parsed.speedDials.slice(0, MAX_BOOKMARKS).forEach((dial, index) => this.upsertSpeedDial(dial, index));
      }
      if (Array.isArray(parsed.history)) {
        parsed.history.slice(0, MAX_HISTORY_ITEMS).forEach((entry) => this.recordHistory(entry));
      }
      if (Array.isArray(parsed.downloads)) {
        parsed.downloads.slice(0, MAX_DOWNLOAD_ITEMS).forEach((entry) => this.upsertDownload(entry));
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        this.updateSettings(parsed.settings);
      }
      this.db.prepare(`
        INSERT INTO app_settings(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("legacy_json_migrated", JSON.stringify(true));
    } catch {
      this.db.prepare(`
        INSERT INTO app_settings(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("legacy_json_migrated", JSON.stringify(false));
    }
  }

  sanitizeItem(item, accent = "#2563eb") {
    return {
      title: `${item?.title || ""}`.slice(0, 80) || "Untitled",
      url: `${item?.url || ""}`.slice(0, 500),
      accent: `${item?.accent || accent}`.slice(0, 20)
    };
  }

  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM app_settings").all();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (!(row.key in DEFAULT_SETTINGS)) {
        continue;
      }
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  }

  getAppValue(key, fallback = null) {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    if (!row) {
      return fallback;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setAppValue(key, value) {
    this.db.prepare(`
      INSERT INTO app_settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  }

  updateSettings(nextSettings) {
    const upsert = this.db.prepare(`
      INSERT INTO app_settings(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [key, value] of Object.entries(nextSettings)) {
      upsert.run(key, JSON.stringify(value));
    }
  }

  listBookmarks() {
    return this.db.prepare(`
      SELECT title, url, accent, created_at AS createdAt
      FROM bookmarks
      ORDER BY created_at DESC
      LIMIT ?
    `).all(MAX_BOOKMARKS);
  }

  upsertBookmark(item) {
    const bookmark = this.sanitizeItem(item);
    this.db.prepare(`
      INSERT INTO bookmarks(url, title, accent, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        accent = excluded.accent
    `).run(bookmark.url, bookmark.title, bookmark.accent, new Date().toISOString());

    this.trimTable("bookmarks", MAX_BOOKMARKS, "created_at DESC");
  }

  removeBookmark(url) {
    this.db.prepare("DELETE FROM bookmarks WHERE url = ?").run(url);
  }

  findBookmark(url) {
    return this.db.prepare(`
      SELECT title, url, accent, created_at AS createdAt
      FROM bookmarks
      WHERE url = ?
    `).get(url) || null;
  }

  listSpeedDials() {
    return this.db.prepare(`
      SELECT title, url, accent, position
      FROM speed_dials
      ORDER BY position ASC, created_at ASC
      LIMIT ?
    `).all(MAX_BOOKMARKS);
  }

  upsertSpeedDial(item, preferredPosition = null) {
    const dial = this.sanitizeItem(item, "#1d4ed8");
    const maxPosition = this.db.prepare("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM speed_dials").get().maxPosition;
    const position = preferredPosition ?? Math.min(maxPosition + 1, MAX_BOOKMARKS - 1);
    this.db.prepare(`
      INSERT INTO speed_dials(url, title, accent, position, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        accent = excluded.accent,
        position = excluded.position
    `).run(dial.url, dial.title, dial.accent, position, new Date().toISOString());
    this.trimTable("speed_dials", MAX_BOOKMARKS, "position ASC, created_at ASC");
    this.normalizeSpeedDialPositions();
  }

  removeSpeedDial(url) {
    this.db.prepare("DELETE FROM speed_dials WHERE url = ?").run(url);
    this.normalizeSpeedDialPositions();
  }

  normalizeSpeedDialPositions() {
    const rows = this.db.prepare("SELECT url FROM speed_dials ORDER BY position ASC, created_at ASC").all();
    const update = this.db.prepare("UPDATE speed_dials SET position = ? WHERE url = ?");
    rows.forEach((row, index) => update.run(index, row.url));
  }

  listHistory() {
    return this.db.prepare(`
      SELECT title, url, visited_at AS visitedAt
      FROM history_entries
      ORDER BY visited_at DESC
      LIMIT ?
    `).all(MAX_HISTORY_ITEMS);
  }

  recordHistory(item) {
    const title = `${item?.title || ""}`.slice(0, 160) || "Untitled";
    const url = `${item?.url || ""}`.slice(0, 500);
    if (!url) {
      return;
    }
    this.db.prepare(`
      INSERT INTO history_entries(url, title, visited_at)
      VALUES (?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        visited_at = excluded.visited_at
    `).run(url, title, item.visitedAt || new Date().toISOString());
    this.trimTable("history_entries", MAX_HISTORY_ITEMS, "visited_at DESC");
  }

  clearHistory() {
    this.db.prepare("DELETE FROM history_entries").run();
  }

  listDownloads() {
    return this.db.prepare(`
      SELECT id, filename, url, save_path AS savePath, received_bytes AS receivedBytes,
             total_bytes AS totalBytes, state, started_at AS startedAt, finished_at AS finishedAt
      FROM downloads
      ORDER BY started_at DESC
      LIMIT ?
    `).all(MAX_DOWNLOAD_ITEMS);
  }

  upsertDownload(entry) {
    this.db.prepare(`
      INSERT INTO downloads(id, filename, url, save_path, received_bytes, total_bytes, state, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        url = excluded.url,
        save_path = excluded.save_path,
        received_bytes = excluded.received_bytes,
        total_bytes = excluded.total_bytes,
        state = excluded.state,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at
    `).run(
      entry.id,
      entry.filename || "Download",
      entry.url || "",
      entry.savePath || null,
      Number(entry.receivedBytes || 0),
      Number(entry.totalBytes || 0),
      entry.state || "progressing",
      entry.startedAt || new Date().toISOString(),
      entry.finishedAt || null
    );
    this.trimTable("downloads", MAX_DOWNLOAD_ITEMS, "started_at DESC");
  }

  clearDownloads() {
    this.db.prepare("DELETE FROM downloads").run();
  }

  getAiPermissions() {
    const rows = this.db.prepare("SELECT scope, allowed FROM ai_permissions").all();
    const permissions = { ...DEFAULT_AI_PERMISSIONS };
    for (const row of rows) {
      permissions[row.scope] = Boolean(row.allowed);
    }
    return permissions;
  }

  setAiPermission(scope, allowed) {
    this.db.prepare(`
      INSERT INTO ai_permissions(scope, allowed, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET
        allowed = excluded.allowed,
        updated_at = excluded.updated_at
    `).run(scope, allowed ? 1 : 0, new Date().toISOString());
  }

  logAiActivity(action, status, summary) {
    this.db.prepare(`
      INSERT INTO ai_activity(action, status, summary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(action, status, summary.slice(0, 1000), new Date().toISOString());
  }

  listAiActivity(limit = 12) {
    return this.db.prepare(`
      SELECT id, action, status, summary, created_at AS createdAt
      FROM ai_activity
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  getBrowserState() {
    return {
      bookmarks: this.listBookmarks(),
      history: this.listHistory(),
      downloads: this.listDownloads(),
      settings: this.getSettings(),
      speedDials: this.listSpeedDials(),
      aiPermissions: this.getAiPermissions(),
      aiActivity: this.listAiActivity()
    };
  }

  loadSession(sessionName = "last") {
    return this.db.prepare(`
      SELECT position, kind, url, title, is_active AS isActive, saved_at AS savedAt
      FROM session_tabs
      WHERE session_name = ?
      ORDER BY position ASC
    `).all(sessionName);
  }

  saveSession(entries, sessionName = "last") {
    const insert = this.db.prepare(`
      INSERT INTO session_tabs(session_name, position, kind, url, title, is_active, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM session_tabs WHERE session_name = ?").run(sessionName);
      entries.forEach((entry, index) => {
        insert.run(
          sessionName,
          index,
          entry.kind || "start",
          entry.url || "nexa://start",
          entry.title || "New Tab",
          entry.isActive ? 1 : 0,
          now
        );
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markShutdownState(isClean) {
    this.setAppValue(SHUTDOWN_STATE_KEY, Boolean(isClean));
  }

  wasLastShutdownClean() {
    return Boolean(this.getAppValue(SHUTDOWN_STATE_KEY, true));
  }

  getCrashRecoverySession() {
    const entries = this.loadSession("last");
    if (!entries.length || this.wasLastShutdownClean()) {
      return null;
    }

    return {
      entries,
      savedAt: entries[0].savedAt || null
    };
  }

  dismissCrashRecovery() {
    this.markShutdownState(true);
  }

  trimTable(tableName, limit, orderBy) {
    this.db.prepare(`
      DELETE FROM ${tableName}
      WHERE rowid NOT IN (
        SELECT rowid FROM ${tableName}
        ORDER BY ${orderBy}
        LIMIT ?
      )
    `).run(limit);
  }

  // ---- Brain run log ----
  // Used by the NexaBrain to persist each goal -> plan -> run lifecycle.
  // We don't trim this table; the user can clear it from the renderer later.

  logBrainRun({
    id,
    goal,
    intent,
    status,
    plan,
    workflowId,
    clarifications,
    answers,
    requiredPermissions,
    result,
    error,
    createdAt,
    updatedAt
  }) {
    this.db.prepare(`
      INSERT INTO brain_runs(id, goal, intent, status, plan, workflow_id,
                              clarifications, answers, required_permissions,
                              result, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        plan = excluded.plan,
        workflow_id = excluded.workflow_id,
        clarifications = excluded.clarifications,
        answers = excluded.answers,
        required_permissions = excluded.required_permissions,
        result = excluded.result,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      id,
      `${goal || ""}`.slice(0, 2000),
      intent || null,
      status,
      plan ? JSON.stringify(plan) : null,
      workflowId || null,
      clarifications ? JSON.stringify(clarifications) : null,
      answers ? JSON.stringify(answers) : null,
      requiredPermissions ? JSON.stringify(requiredPermissions) : null,
      result ? JSON.stringify(result) : null,
      error ? `${error}`.slice(0, 1000) : null,
      Number(createdAt) || Date.now(),
      Number(updatedAt) || Date.now()
    );
  }

  listBrainRuns(limit = 25) {
    const rows = this.db.prepare(`
      SELECT id, goal, intent, status, workflow_id AS workflowId,
             clarifications, answers, required_permissions AS requiredPermissions,
             result, error, created_at AS createdAt, updated_at AS updatedAt
      FROM brain_runs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((r) => ({
      ...r,
      clarifications: r.clarifications ? JSON.parse(r.clarifications) : [],
      answers: r.answers ? JSON.parse(r.answers) : {},
      requiredPermissions: r.requiredPermissions ? JSON.parse(r.requiredPermissions) : [],
      result: r.result ? JSON.parse(r.result) : null,
      plan: null
    }));
  }

  getBrainRun(id) {
    const row = this.db.prepare(`
      SELECT id, goal, intent, status, plan, workflow_id AS workflowId,
             clarifications, answers, required_permissions AS requiredPermissions,
             result, error, created_at AS createdAt, updated_at AS updatedAt
      FROM brain_runs
      WHERE id = ?
    `).get(id);
    if (!row) return null;
    return {
      ...row,
      clarifications: row.clarifications ? JSON.parse(row.clarifications) : [],
      answers: row.answers ? JSON.parse(row.answers) : {},
      requiredPermissions: row.requiredPermissions ? JSON.parse(row.requiredPermissions) : [],
      result: row.result ? JSON.parse(row.result) : null,
      plan: row.plan ? JSON.parse(row.plan) : null
    };
  }
}

module.exports = {
  BrowserDatabase,
  DEFAULT_AI_PERMISSIONS,
  DEFAULT_SETTINGS,
  DEFAULT_SPEED_DIALS
};

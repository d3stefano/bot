import Database from 'better-sqlite3';

const db = new Database('bot.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_info (
    user_id TEXT PRIMARY KEY,
    rank TEXT,
    role_id TEXT,
    hire_date TEXT,
    ign TEXT,
    punishment_count INTEGER DEFAULT 0
  );
`);

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key, value)
    VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getRoleIds(scope) {
  const key = scope === 'admin' ? 'admin_role_ids' : 'staff_role_ids';
  const raw = getSetting(key, '[]');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function setRoleIds(scope, ids) {
  const key = scope === 'admin' ? 'admin_role_ids' : 'staff_role_ids';
  setSetting(key, JSON.stringify(ids));
}

export function upsertStaff({ userId, rank, roleId, hireDate }) {
  db.prepare(`
    INSERT INTO staff_info(user_id, rank, role_id, hire_date)
    VALUES(@userId, @rank, @roleId, @hireDate)
    ON CONFLICT(user_id) DO UPDATE SET
      rank = excluded.rank,
      role_id = excluded.role_id,
      hire_date = excluded.hire_date
  `).run({ userId, rank, roleId, hireDate });
}

export function listStaff() {
  return db.prepare('SELECT * FROM staff_info ORDER BY rank ASC').all();
}

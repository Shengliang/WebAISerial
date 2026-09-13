/**
 * Exporter for SQLite Databases and Offline Disk Storage
 * Allows exporting 60-month IndexedDB firmware logs directly to SQLite .sql scripts,
 * NDJSON archive files, or streaming to local disk directories via File System Access API.
 */

import { TaskSessionRecord } from '../types';
import { downloadFile } from './exportTools';

/**
 * Escapes a string for SQL string literals in SQLite
 */
function escapeSql(str: string | undefined | null): string {
  if (str === undefined || str === null) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Generates standard SQLite 3 DDL schema and DML INSERT statements
 * Ready to be piped directly into `sqlite3 firmware_archive.db`
 */
export function generateSqliteDump(sessions: TaskSessionRecord[]): string {
  const lines: string[] = [];

  lines.push('-- =========================================================');
  lines.push('-- SQLite 3 Database Dump - Embedded Firmware Debug Sessions');
  lines.push(`-- Generated on: ${new Date().toISOString()}`);
  lines.push(`-- Total Sessions Included: ${sessions.length}`);
  lines.push('-- Compatible with SQLite3, PostgreSQL, MySQL, DuckDB');
  lines.push('-- =========================================================');
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');

  // 1. DDL Statements
  lines.push('-- Table: tasks');
  lines.push('CREATE TABLE IF NOT EXISTS tasks (');
  lines.push('  task_id TEXT PRIMARY KEY,');
  lines.push('  task_name TEXT NOT NULL,');
  lines.push('  created_at INTEGER NOT NULL,');
  lines.push('  last_session_at INTEGER NOT NULL');
  lines.push(');');
  lines.push('');

  lines.push('-- Table: sessions');
  lines.push('CREATE TABLE IF NOT EXISTS sessions (');
  lines.push('  session_id TEXT PRIMARY KEY,');
  lines.push('  task_id TEXT NOT NULL,');
  lines.push('  session_name TEXT,');
  lines.push('  timestamp INTEGER NOT NULL,');
  lines.push('  date_key TEXT NOT NULL,');
  lines.push('  month_key TEXT NOT NULL,');
  lines.push('  device_id TEXT,');
  lines.push('  device_name TEXT,');
  lines.push('  baud_rate INTEGER,');
  lines.push('  firmware_image_name TEXT,');
  lines.push('  firmware_size INTEGER,');
  lines.push('  firmware_hash TEXT,');
  lines.push('  target_address TEXT,');
  lines.push('  power_cycle_method TEXT,');
  lines.push('  boot_outcome TEXT NOT NULL,');
  lines.push('  duration_ms INTEGER,');
  lines.push('  log_count INTEGER,');
  lines.push('  error_count INTEGER,');
  lines.push('  warn_count INTEGER,');
  lines.push('  raw_log_size INTEGER,');
  lines.push('  engineer_name TEXT,');
  lines.push('  notes TEXT,');
  lines.push('  FOREIGN KEY (task_id) REFERENCES tasks(task_id)');
  lines.push(');');
  lines.push('');

  lines.push('-- Table: console_logs');
  lines.push('CREATE TABLE IF NOT EXISTS console_logs (');
  lines.push('  log_id TEXT PRIMARY KEY,');
  lines.push('  session_id TEXT NOT NULL,');
  lines.push('  timestamp INTEGER NOT NULL,');
  lines.push('  log_level TEXT NOT NULL,');
  lines.push('  direction TEXT NOT NULL,');
  lines.push('  message TEXT NOT NULL,');
  lines.push('  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE');
  lines.push(');');
  lines.push('');

  lines.push('-- Optimization Indexes');
  lines.push('CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);');
  lines.push('CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date_key);');
  lines.push('CREATE INDEX IF NOT EXISTS idx_sessions_month ON sessions(month_key);');
  lines.push('CREATE INDEX IF NOT EXISTS idx_sessions_outcome ON sessions(boot_outcome);');
  lines.push('CREATE INDEX IF NOT EXISTS idx_logs_session ON console_logs(session_id);');
  lines.push('CREATE INDEX IF NOT EXISTS idx_logs_level ON console_logs(log_level);');
  lines.push('');

  // 2. Insert Tasks
  const taskMap = new Map<string, { taskId: string; minTs: number; maxTs: number }>();
  sessions.forEach(s => {
    const existing = taskMap.get(s.taskId);
    if (!existing) {
      taskMap.set(s.taskId, { taskId: s.taskId, minTs: s.timestamp, maxTs: s.timestamp });
    } else {
      existing.minTs = Math.min(existing.minTs, s.timestamp);
      existing.maxTs = Math.max(existing.maxTs, s.timestamp);
    }
  });

  lines.push('-- Data: tasks');
  taskMap.forEach(t => {
    lines.push(
      `INSERT OR IGNORE INTO tasks (task_id, task_name, created_at, last_session_at) VALUES (${escapeSql(t.taskId)}, ${escapeSql(t.taskId)}, ${t.minTs}, ${t.maxTs});`
    );
  });
  lines.push('');

  // 3. Insert Sessions & Console Logs
  lines.push('-- Data: sessions & console_logs');
  for (const s of sessions) {
    const fw = s.firmwareImage;
    lines.push(
      `INSERT OR REPLACE INTO sessions (` +
        `session_id, task_id, session_name, timestamp, date_key, month_key, device_id, device_name, baud_rate, ` +
        `firmware_image_name, firmware_size, firmware_hash, target_address, power_cycle_method, boot_outcome, ` +
        `duration_ms, log_count, error_count, warn_count, raw_log_size, engineer_name, notes` +
        `) VALUES (` +
        `${escapeSql(s.id)}, ` +
        `${escapeSql(s.taskId)}, ` +
        `${escapeSql(s.sessionName)}, ` +
        `${s.timestamp}, ` +
        `${escapeSql(s.dateKey)}, ` +
        `${escapeSql(s.monthKey)}, ` +
        `${escapeSql(s.deviceId)}, ` +
        `${escapeSql(s.deviceName)}, ` +
        `${s.baudRate}, ` +
        `${escapeSql(fw?.name)}, ` +
        `${fw?.size || 0}, ` +
        `${escapeSql(fw?.hashSha256 || fw?.hashMd5)}, ` +
        `${escapeSql(fw?.targetAddress)}, ` +
        `${escapeSql(s.powerCycleMethod)}, ` +
        `${escapeSql(s.bootOutcome)}, ` +
        `${s.durationMs}, ` +
        `${s.logCount}, ` +
        `${s.errorCount}, ` +
        `${s.warnCount}, ` +
        `${s.rawLogSize}, ` +
        `${escapeSql(s.engineerName)}, ` +
        `${escapeSql(s.notes)}` +
        `);`
    );

    // Insert associated logs
    if (s.logs && s.logs.length > 0) {
      for (const l of s.logs) {
        lines.push(
          `INSERT OR REPLACE INTO console_logs (` +
            `log_id, session_id, timestamp, log_level, direction, message` +
            `) VALUES (` +
            `${escapeSql(l.id)}, ` +
            `${escapeSql(s.id)}, ` +
            `${l.timestamp}, ` +
            `${escapeSql(l.level)}, ` +
            `${escapeSql(l.direction)}, ` +
            `${escapeSql(l.text)}` +
            `);`
        );
      }
    }
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('-- End of SQLite Dump');

  return lines.join('\n');
}

/**
 * Downloads SQLite script to local file
 */
export function exportToSqliteFile(sessions: TaskSessionRecord[], filenamePrefix = 'firmware_debug'): void {
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${filenamePrefix}_${dateStr}.sqlite.sql`;
  const sqlContent = generateSqliteDump(sessions);
  downloadFile(sqlContent, filename, 'application/sql');
}

/**
 * Exports sessions in JSON or NDJSON format for disk archiving
 */
export function exportToNdjsonFile(sessions: TaskSessionRecord[], filenamePrefix = 'firmware_sessions'): void {
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${filenamePrefix}_${dateStr}.ndjson`;
  const ndjson = sessions.map(s => JSON.stringify(s)).join('\n');
  downloadFile(ndjson, filename, 'application/x-ndjson');
}

/**
 * Offline Disk Storage Exporter using the File System Access API
 * Lets the user pick a folder on their hard drive / external SSD, and streams
 * session logs directly into dated directory trees:
 * /<SelectedFolder>/<MonthKey>/<TaskID>_<SessionID>.log
 */
export async function exportDirectlyToOfflineDiskFolder(
  sessions: TaskSessionRecord[],
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<{ success: boolean; filesWritten: number; folderName?: string; error?: string }> {
  // Check browser support for File System Access API
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'File System Access API (showDirectoryPicker) is not supported in this browser. Please use standard SQLite or NDJSON file export.'
    );
  }

  try {
    // Prompt user to select target directory on disk
    const rootHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    let count = 0;
    const total = sessions.length;

    for (const session of sessions) {
      // 1. Create or open month directory e.g. "2026-09"
      const monthDirHandle = await rootHandle.getDirectoryHandle(session.monthKey, { create: true });

      // 2. Create file e.g. "TASK-FW-2026-ESP32-S3__SESS-0042.log"
      const safeTaskId = session.taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeTaskId}__${safeSessionId}.log`;

      const fileHandle = await monthDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      // Format log file with header
      const header = [
        `# FIRMWARE CONSOLE SESSION LOG`,
        `# Session ID: ${session.id}`,
        `# Task ID: ${session.taskId}`,
        `# Timestamp: ${new Date(session.timestamp).toISOString()}`,
        `# Device: ${session.deviceName} (${session.baudRate} bps)`,
        `# Firmware: ${session.firmwareImage?.name || 'N/A'} (Address: ${session.firmwareImage?.targetAddress || 'N/A'})`,
        `# Power Cycle: ${session.powerCycleMethod}`,
        `# Boot Outcome: ${session.bootOutcome}`,
        `# Total Lines: ${session.logCount}, Errors: ${session.errorCount}, Warnings: ${session.warnCount}`,
        `# Engineer: ${session.engineerName}`,
        `# -------------------------------------------------------------`,
        '',
      ].join('\n');

      const logBody = session.logs.map(l => {
        const time = new Date(l.timestamp).toISOString().split('T')[1].replace('Z', '');
        return `[${time}] [${l.direction}] [${l.level.padEnd(5)}] ${l.text}`;
      }).join('\n');

      await writable.write(header + logBody);
      await writable.close();

      count++;
      if (onProgress) {
        onProgress(count, total, `${session.monthKey}/${fileName}`);
      }
    }

    return {
      success: true,
      filesWritten: count,
      folderName: rootHandle.name,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, filesWritten: 0, error: 'User cancelled folder selection.' };
    }
    return { success: false, filesWritten: 0, error: err.message || 'Disk write error' };
  }
}

/**
 * IndexedDB Storage Engine for 60-Month Firmware Debugging Sessions
 * Supports high-capacity local logging (~100 sessions/day over 60 months)
 */

import { StorageQuotaInfo, TaskSessionRecord, TaskSummary } from '../types';

const DB_NAME = 'FirmwareDebugStorageDB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_TASKS = 'tasks';

class IndexedDBStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initializes and opens the IndexedDB database
   */
  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Sessions store
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          sessionStore.createIndex('by_taskId', 'taskId', { unique: false });
          sessionStore.createIndex('by_timestamp', 'timestamp', { unique: false });
          sessionStore.createIndex('by_dateKey', 'dateKey', { unique: false });
          sessionStore.createIndex('by_monthKey', 'monthKey', { unique: false });
          sessionStore.createIndex('by_bootOutcome', 'bootOutcome', { unique: false });
          sessionStore.createIndex('by_deviceId', 'deviceId', { unique: false });
        }

        // Tasks summary store
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          const taskStore = db.createObjectStore(STORE_TASKS, { keyPath: 'taskId' });
          taskStore.createIndex('by_lastSessionDate', 'lastSessionDate', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Saves a completed firmware debug session to IndexedDB
   */
  public async saveSession(session: TaskSessionRecord): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_TASKS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const taskStore = tx.objectStore(STORE_TASKS);

      sessionStore.put(session);

      // Update or create task summary
      const taskReq = taskStore.get(session.taskId);
      taskReq.onsuccess = () => {
        const existing: TaskSummary = taskReq.result || {
          taskId: session.taskId,
          taskName: session.taskId,
          createdDate: session.timestamp,
          lastSessionDate: session.timestamp,
          totalSessions: 0,
          passedSessions: 0,
          failedSessions: 0,
        };

        existing.totalSessions += 1;
        existing.lastSessionDate = Math.max(existing.lastSessionDate, session.timestamp);
        if (session.bootOutcome === 'BOOT_SUCCESS') {
          existing.passedSessions += 1;
        } else {
          existing.failedSessions += 1;
        }

        taskStore.put(existing);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Bulk insert sessions (useful for imports or batch runs)
   */
  public async saveSessionsBulk(sessions: TaskSessionRecord[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_TASKS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);

      sessions.forEach(session => sessionStore.put(session));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Retrieves a single session by session ID
   */
  public async getSession(id: string): Promise<TaskSessionRecord | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Queries sessions with filter options (Task ID, Date, Month, Boot Outcome)
   */
  public async querySessions(filter?: {
    taskId?: string;
    dateKey?: string;
    monthKey?: string;
    bootOutcome?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: TaskSessionRecord[]; totalCount: number }> {
    const db = await this.getDB();
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);

      let targetIndex: IDBIndex | IDBObjectStore = store;
      let range: IDBKeyRange | null = null;

      if (filter?.taskId) {
        targetIndex = store.index('by_taskId');
        range = IDBKeyRange.only(filter.taskId);
      } else if (filter?.dateKey) {
        targetIndex = store.index('by_dateKey');
        range = IDBKeyRange.only(filter.dateKey);
      } else if (filter?.monthKey) {
        targetIndex = store.index('by_monthKey');
        range = IDBKeyRange.only(filter.monthKey);
      } else if (filter?.bootOutcome && filter.bootOutcome !== 'ALL') {
        targetIndex = store.index('by_bootOutcome');
        range = IDBKeyRange.only(filter.bootOutcome);
      } else {
        targetIndex = store.index('by_timestamp');
      }

      const results: TaskSessionRecord[] = [];
      let totalMatched = 0;

      // Cursor open in reverse order (newest first)
      const cursorReq = targetIndex.openCursor(range, 'prev');

      cursorReq.onsuccess = event => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve({ items: results, totalCount: totalMatched });
          return;
        }

        const session = cursor.value as TaskSessionRecord;
        let matches = true;

        if (filter?.taskId && session.taskId !== filter.taskId) matches = false;
        if (filter?.dateKey && session.dateKey !== filter.dateKey) matches = false;
        if (filter?.monthKey && session.monthKey !== filter.monthKey) matches = false;
        if (filter?.bootOutcome && filter.bootOutcome !== 'ALL' && session.bootOutcome !== filter.bootOutcome) {
          matches = false;
        }
        if (filter?.searchQuery) {
          const q = filter.searchQuery.toLowerCase();
          const hasInTask = session.taskId.toLowerCase().includes(q);
          const hasInId = session.id.toLowerCase().includes(q);
          const hasInImage = session.firmwareImage?.name.toLowerCase().includes(q) || false;
          if (!hasInTask && !hasInId && !hasInImage) matches = false;
        }

        if (matches) {
          if (totalMatched >= offset && results.length < limit) {
            results.push(session);
          }
          totalMatched++;
        }

        cursor.continue();
      };

      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  /**
   * Retrieves all task summaries
   */
  public async getTasks(): Promise<TaskSummary[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TASKS, 'readonly');
      const store = tx.objectStore(STORE_TASKS);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Counts total stored sessions in IndexedDB
   */
  public async countSessions(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Deletes a specific session
   */
  public async deleteSession(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_TASKS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      sessionStore.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clears entire IndexedDB session store
   */
  public async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_TASKS], 'readwrite');
      tx.objectStore(STORE_SESSIONS).clear();
      tx.objectStore(STORE_TASKS).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Requests persistent storage from Chrome to protect 60-month data from eviction
   */
  public async requestPersistentStorage(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    }
    return false;
  }

  /**
   * Queries real browser storage quota (usage vs available)
   * Calculates projected 60-month retention capacity (100 sessions/day = 180,000 sessions)
   */
  public async getStorageQuota(): Promise<StorageQuotaInfo> {
    let usageBytes = 0;
    let quotaBytes = 50 * 1024 * 1024 * 1024; // Default fallback 50 GB
    let isPersistent = false;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        usageBytes = estimate.usage || 0;
        quotaBytes = estimate.quota || quotaBytes;
      } catch (err) {
        console.warn('Storage estimate failed:', err);
      }
    }

    if (navigator.storage && navigator.storage.persisted) {
      try {
        isPersistent = await navigator.storage.persisted();
      } catch {
        isPersistent = false;
      }
    }

    const totalSavedSessions = await this.countSessions();

    // Average log session size is ~15-25 KB.
    // 100 sessions/day * 30 days * 60 months = 180,000 sessions (~3.6 GB to 5.4 GB).
    // Modern Chrome grants 60% of free disk space (often 20 GB to 200 GB).
    const avgSessionBytes = usageBytes > 0 && totalSavedSessions > 0
      ? Math.max(15000, Math.round(usageBytes / totalSavedSessions))
      : 20000;

    const maxEstimatedSessions = Math.floor(quotaBytes / avgSessionBytes);
    const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

    return {
      usageBytes,
      quotaBytes,
      usagePercent,
      totalSavedSessions,
      estimated60MonthCapacitySessions: maxEstimatedSessions,
      isPersistent,
    };
  }

  /**
   * Seeds realistic sample historical test sessions spanning 60 months
   * Allows immediate verification of 60-month timeline, tasks, and SQLite export.
   */
  public async seedHistoricalData(count = 120): Promise<void> {
    const tasks = [
      'TASK-FW-2026-ESP32-S3',
      'TASK-FW-2026-CAN-BUS',
      'TASK-FW-2025-OTA-UPDATE',
      'TASK-FW-2025-POWER-SLEEP',
      'TASK-FW-2024-WIFI-MESH',
      'TASK-FW-2024-BOOTLOADER',
      'TASK-FW-2023-SENSOR-CALIB',
      'TASK-FW-2022-CRYPTO-ENGINE',
    ];

    const outcomes = [
      'BOOT_SUCCESS',
      'BOOT_SUCCESS',
      'BOOT_SUCCESS',
      'BOOT_SUCCESS',
      'CRASH_PANIC',
      'WATCHDOG_RESET',
      'BOOT_SUCCESS',
      'HARDFAULT',
    ] as const;

    const sampleSessions: TaskSessionRecord[] = [];
    const now = Date.now();
    const dayMs = 86400000;

    for (let i = 0; i < count; i++) {
      // Spread across past 5 years (up to 1800 days)
      const dayOffset = Math.floor((i / count) * 1800);
      const timestamp = now - dayOffset * dayMs;
      const date = new Date(timestamp);
      const dateKey = date.toISOString().split('T')[0];
      const monthKey = dateKey.substring(0, 7);

      const taskId = tasks[i % tasks.length];
      const outcome = outcomes[i % outcomes.length];
      const sessionId = `SESS-${dateKey.replace(/-/g, '')}-${(i + 1).toString().padStart(4, '0')}`;

      const logsCount = Math.floor(Math.random() * 80) + 20;
      const mockLogs = [
        {
          id: `log-${i}-1`,
          timestamp: timestamp + 10,
          deviceId: 'dev-1',
          deviceName: 'ESP32-S3 Board',
          level: 'INFO' as const,
          direction: 'RX' as const,
          text: `rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)`,
        },
        {
          id: `log-${i}-2`,
          timestamp: timestamp + 25,
          deviceId: 'dev-1',
          deviceName: 'ESP32-S3 Board',
          level: 'INFO' as const,
          direction: 'RX' as const,
          text: `configsip: 0, SPIWP:0xee, clk_drv:0x00,q_drv:0x00,d_drv:0x00`,
        },
        {
          id: `log-${i}-3`,
          timestamp: timestamp + 40,
          deviceId: 'dev-1',
          deviceName: 'ESP32-S3 Board',
          level: 'INFO' as const,
          direction: 'RX' as const,
          text: `load:0x3fce3808,len:0x4bc, ho:0 tail:4 chksum:0x18`,
        },
        {
          id: `log-${i}-4`,
          timestamp: timestamp + 120,
          deviceId: 'dev-1',
          deviceName: 'ESP32-S3 Board',
          level: outcome === 'BOOT_SUCCESS' ? ('INFO' as const) : ('ERROR' as const),
          direction: 'RX' as const,
          text:
            outcome === 'BOOT_SUCCESS'
              ? `[00:00:00.120] app_main: Firmware booted successfully. System ready.`
              : outcome === 'CRASH_PANIC'
              ? `[00:00:00.145] Guru Meditation Error: Core 0 panic'ed (LoadProhibited). Exception was unhandled.`
              : outcome === 'WATCHDOG_RESET'
              ? `[00:00:00.180] Task watchdog got triggered. The following tasks did not feed the watchdog in 5000ms: IDLE0`
              : `[00:00:00.150] HardFault_Handler: Bus fault detected at PC=0x080014B2`,
        },
      ];

      sampleSessions.push({
        id: sessionId,
        taskId,
        sessionName: `${taskId} Run #${i + 1}`,
        timestamp,
        dateKey,
        monthKey,
        deviceId: 'dev-1',
        deviceName: 'ESP32-S3 Board',
        baudRate: 115200,
        firmwareImage: {
          name: `firmware_v${(2 + (i % 5)) * 0.5 + 1.0}.bin`,
          size: 492040 + i * 1024,
          type: '.bin',
          hashMd5: 'a8b9c0d1e2f3456789abcdef01234567',
          targetAddress: '0x10000',
          versionTag: `v2.${(i % 12) + 1}.0`,
          uploadTimestamp: timestamp - 12000,
        },
        powerCycleMethod: 'dtr_rts_pulse',
        bootOutcome: outcome,
        durationMs: 4200,
        logCount: logsCount,
        errorCount: outcome === 'BOOT_SUCCESS' ? 0 : 2,
        warnCount: 1,
        rawLogSize: 18450,
        logs: mockLogs,
        engineerName: 'Firmware Test Bench',
        notes: `Automated test run for ${taskId}`,
      });
    }

    await this.saveSessionsBulk(sampleSessions);
  }
}

export const indexedDBStorage = new IndexedDBStorageService();

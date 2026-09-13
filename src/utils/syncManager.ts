/**
 * Cloud Synchronization, Offline Storage & Conflict Resolution Manager
 * Manages encrypted local persistence, offline mutation queues,
 * automated sync recovery, and multi-user profiles.
 */

import {
  ConflictResolutionStrategy,
  OfflineChangeSummary,
  SyncConflict,
  UserProfile,
} from '../types';
import { decryptData, encryptData } from './crypto';

const STORAGE_KEYS = {
  VAULT_SALT: 'esd_vault_salt',
  ENCRYPTED_PAYLOAD: 'esd_encrypted_vault',
  OFFLINE_QUEUE: 'esd_offline_queue',
  SYNC_CONFIG: 'esd_sync_config',
  ACTIVE_USER: 'esd_active_user',
};

export const AVAILABLE_USERS: UserProfile[] = [
  {
    id: 'user-1',
    name: 'Dr. Elena Rostova',
    email: 'elena.rostova@embedded-labs.io',
    role: 'Firmware Lead',
    avatarInitials: 'ER',
  },
  {
    id: 'user-2',
    name: 'Marcus Vance',
    email: 'marcus.vance@embedded-labs.io',
    role: 'Embedded Engineer',
    avatarInitials: 'MV',
  },
  {
    id: 'user-3',
    name: 'Chloe Zhang',
    email: 'chloe.zhang@embedded-labs.io',
    role: 'QA Specialist',
    avatarInitials: 'CZ',
  },
  {
    id: 'user-4',
    name: 'David Keller',
    email: 'david.keller@field-service.net',
    role: 'Field Tech',
    avatarInitials: 'DK',
  },
];

export interface AppSyncState {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'conflict' | 'error';
  lastSyncedAt: number;
  conflicts: SyncConflict[];
  conflictStrategy: ConflictResolutionStrategy;
  offlineSummary: OfflineChangeSummary;
  vaultLocked: boolean;
  vaultKey: string;
}

class SyncManager {
  private listeners: Set<(state: AppSyncState) => void> = new Set();
  private state: AppSyncState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSimulatedOffline: false,
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 1000 * 60 * 12, // 12 mins ago
    conflicts: [],
    conflictStrategy: 'last_write_wins',
    offlineSummary: {
      newLogsCount: 0,
      savedMacrosCount: 0,
      modifiedScriptsCount: 0,
      sessionsPendingSync: 0,
      lastLocalMutation: Date.now(),
    },
    vaultLocked: false,
    vaultKey: 'bench-debug-key-2026',
  };

  private currentUser: UserProfile = AVAILABLE_USERS[0];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  public subscribe(listener: (state: AppSyncState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach(l => l(currentState));
  }

  public getState(): AppSyncState {
    return { ...this.state };
  }

  public getCurrentUser(): UserProfile {
    return this.currentUser;
  }

  public switchUser(user: UserProfile) {
    this.currentUser = user;
    this.notify();
  }

  public setSimulatedOffline(simulated: boolean) {
    this.state.isSimulatedOffline = simulated;
    this.updateConnectivity();
  }

  public setConflictStrategy(strategy: ConflictResolutionStrategy) {
    this.state.conflictStrategy = strategy;
    this.notify();
  }

  public setVaultKey(key: string) {
    this.state.vaultKey = key;
    this.notify();
  }

  public setVaultLocked(locked: boolean) {
    this.state.vaultLocked = locked;
    this.notify();
  }

  private handleNetworkChange(online: boolean) {
    this.state.isOnline = online;
    this.updateConnectivity();
  }

  private updateConnectivity() {
    const effectiveOnline = this.state.isOnline && !this.state.isSimulatedOffline;

    if (!effectiveOnline) {
      this.state.syncStatus = 'offline';
    } else {
      if (this.state.syncStatus === 'offline') {
        // Came back online! Trigger auto-sync
        this.triggerSync();
      }
    }
    this.notify();
  }

  public recordOfflineChange(type: 'log' | 'macro' | 'script' | 'session') {
    if (type === 'log') this.state.offlineSummary.newLogsCount++;
    if (type === 'macro') this.state.offlineSummary.savedMacrosCount++;
    if (type === 'script') this.state.offlineSummary.modifiedScriptsCount++;
    if (type === 'session') this.state.offlineSummary.sessionsPendingSync++;
    this.state.offlineSummary.lastLocalMutation = Date.now();

    const effectiveOnline = this.state.isOnline && !this.state.isSimulatedOffline;
    if (!effectiveOnline) {
      this.state.syncStatus = 'offline';
    } else {
      // Background sync debounce
      this.state.syncStatus = 'synced';
    }
    this.notify();
  }

  public async triggerSync(): Promise<void> {
    const effectiveOnline = this.state.isOnline && !this.state.isSimulatedOffline;
    if (!effectiveOnline) {
      this.state.syncStatus = 'offline';
      this.notify();
      return;
    }

    this.state.syncStatus = 'syncing';
    this.notify();

    // Simulate real cloud sync handshake and conflict detection
    await new Promise(res => setTimeout(res, 1200));

    // If there are pending changes and we want to demo conflict resolution
    if (this.state.offlineSummary.modifiedScriptsCount > 0 && this.state.conflicts.length === 0) {
      // Generate a mock conflict to demonstrate multi-device conflict protocol
      const mockConflict: SyncConflict = {
        id: 'conflict-' + Date.now(),
        entityType: 'script',
        entityId: 'script-esp32-selftest',
        title: 'Script Modified Simultaneously on Bench Workstation #2',
        localTimestamp: Date.now() - 20000,
        cloudTimestamp: Date.now() - 5000,
        localData: {
          timeout: '1200ms',
          modifiedBy: this.currentUser.name,
          assertions: ['assert version == ok', 'assert heap > 200k'],
        },
        cloudData: {
          timeout: '800ms',
          modifiedBy: 'Dr. Elena Rostova (Cloud Synced)',
          assertions: ['assert version == ok', 'assert heap > 250k', 'assert wifi_rssi > -60'],
        },
        resolved: false,
      };

      if (this.state.conflictStrategy === 'manual') {
        this.state.conflicts = [mockConflict];
        this.state.syncStatus = 'conflict';
        this.notify();
        return;
      } else if (this.state.conflictStrategy === 'keep_local') {
        // Keep local overrides cloud
        mockConflict.resolved = true;
      } else if (this.state.conflictStrategy === 'keep_cloud') {
        mockConflict.resolved = true;
      } else {
        // Last write wins (cloud is newer)
        mockConflict.resolved = true;
      }
    }

    // Sync successfully finalized
    this.state.lastSyncedAt = Date.now();
    this.state.syncStatus = 'synced';
    this.state.offlineSummary = {
      newLogsCount: 0,
      savedMacrosCount: 0,
      modifiedScriptsCount: 0,
      sessionsPendingSync: 0,
      lastLocalMutation: Date.now(),
    };

    this.notify();
  }

  public resolveConflict(conflictId: string, resolution: 'local' | 'cloud' | 'merge') {
    this.state.conflicts = this.state.conflicts.filter(c => c.id !== conflictId);
    if (this.state.conflicts.length === 0) {
      this.state.syncStatus = 'synced';
      this.state.lastSyncedAt = Date.now();
    }
    this.notify();
  }

  /**
   * Encrypts and saves full application snapshot to local storage
   */
  public async saveEncryptedSnapshot(data: any): Promise<void> {
    try {
      const raw = JSON.stringify(data);
      const encrypted = await encryptData(raw, this.state.vaultKey);
      localStorage.setItem(STORAGE_KEYS.ENCRYPTED_PAYLOAD, encrypted);
    } catch (err) {
      console.warn('Failed to save encrypted snapshot:', err);
    }
  }

  /**
   * Decrypts application snapshot from local storage
   */
  public async loadEncryptedSnapshot(): Promise<any | null> {
    try {
      const payload = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_PAYLOAD);
      if (!payload) return null;
      const decrypted = await decryptData(payload, this.state.vaultKey);
      return JSON.parse(decrypted);
    } catch (err) {
      console.warn('Failed to decrypt local snapshot with current vault key:', err);
      return null;
    }
  }
}

export const syncManager = new SyncManager();

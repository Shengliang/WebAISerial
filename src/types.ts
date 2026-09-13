/**
 * Core types for Embedded Firmware Serial Console & Debugger
 */

export type PortType = 'webserial' | 'virtual';

export type VirtualProfile = 'esp32' | 'stm32' | 'nrf52' | 'custom_echo';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'RAW' | 'COMMAND';

export type DataDirection = 'RX' | 'TX';

export type LineEnding = 'CRLF' | 'LF' | 'CR' | 'NONE';

export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
  bufferSize?: number;
}

export interface SerialDevice {
  id: string;
  name: string;
  portType: PortType;
  virtualProfile?: VirtualProfile;
  status: ConnectionStatus;
  config: SerialConfig;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxBytesSec: number;
  txBytesSec: number;
  dtr: boolean;
  rts: boolean;
  cts: boolean;
  dsr: boolean;
  color: string;
  lastActive: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  level: LogLevel;
  direction: DataDirection;
  text: string;
  rawBytes?: number[];
  hexView?: string;
}

export interface CommandMacro {
  id: string;
  name: string;
  command: string;
  isHex: boolean;
  shortcut?: string;
  category: 'System' | 'Debug' | 'Network' | 'GPIO' | 'Custom';
  description?: string;
}

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  code: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  lastRun?: number;
  results?: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    durationMs: number;
    log: string[];
  };
}

export interface SessionAnalytics {
  sessionId: string;
  sessionName: string;
  startTime: number;
  endTime?: number;
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  rxBytes: number;
  txBytes: number;
  deviceIds: string[];
  throughputSamples: {
    time: string;
    timestamp: number;
    rxBps: number;
    txBps: number;
  }[];
}

export type ConflictResolutionStrategy = 'last_write_wins' | 'keep_local' | 'keep_cloud' | 'manual';

export interface SyncConflict {
  id: string;
  entityType: 'macro' | 'script' | 'session' | 'setting';
  entityId: string;
  title: string;
  localTimestamp: number;
  cloudTimestamp: number;
  localData: any;
  cloudData: any;
  resolved: boolean;
}

export interface OfflineChangeSummary {
  newLogsCount: number;
  savedMacrosCount: number;
  modifiedScriptsCount: number;
  sessionsPendingSync: number;
  lastLocalMutation: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'Firmware Lead' | 'Embedded Engineer' | 'QA Specialist' | 'Field Tech';
  avatarInitials: string;
}

export interface ExportOptions {
  format: 'txt' | 'csv' | 'json' | 'hex' | 'markdown';
  deviceId?: string;
  filterLevel?: LogLevel | 'ALL';
  includeTimestamps: boolean;
  includeHex: boolean;
  compress?: boolean;
}

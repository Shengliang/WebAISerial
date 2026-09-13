import {
  LiveDeviceInfo,
  LiveParticipant,
  LiveRole,
  LiveSessionState,
  LogEntry,
} from '../types';

export type LiveSessionListener = (state: LiveSessionState) => void;
export type LiveLogsListener = (logs: LogEntry[]) => void;
export type LiveCommandListener = (cmd: {
  command: string;
  isHex: boolean;
  timestamp: number;
  writerName: string;
}) => void;

class LiveSessionClient {
  private ws: WebSocket | null = null;
  private listeners: Set<LiveSessionListener> = new Set();
  private logsListeners: Set<LiveLogsListener> = new Set();
  private commandListeners: Set<LiveCommandListener> = new Set();
  private logsClearListeners: Set<() => void> = new Set();

  private state: LiveSessionState = {
    isLive: false,
    role: 'none',
    sessionId: null,
    sessionName: '',
    taskId: '',
    writerName: '',
    writerId: null,
    participants: [],
    connected: false,
    latencyMs: 0,
  };

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingLogQueue: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Check URL parameters on boot to auto-join if ?live=SESSION_ID or ?session=SESSION_ID
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const liveId = params.get('live') || params.get('session');
      if (liveId) {
        // Will be triggered by UI component
      }
    }
  }

  public getState(): LiveSessionState {
    return { ...this.state };
  }

  public subscribe(listener: LiveSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public onLogs(listener: LiveLogsListener): () => void {
    this.logsListeners.add(listener);
    return () => this.logsListeners.delete(listener);
  }

  public onWriterCommand(listener: LiveCommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  public onLogsCleared(listener: () => void): () => void {
    this.logsClearListeners.add(listener);
    return () => this.logsClearListeners.delete(listener);
  }

  private notifyState() {
    const current = this.getState();
    this.listeners.forEach(fn => {
      try {
        fn(current);
      } catch (e) {
        console.error('Error in live session state listener:', e);
      }
    });
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  public startHostSession(
    sessionId: string,
    sessionName: string,
    taskId: string,
    writerName: string,
    deviceInfo: LiveDeviceInfo,
    initialLogs: LogEntry[] = []
  ): Promise<LiveSessionState> {
    return new Promise((resolve, reject) => {
      this.closeSocket();

      try {
        const url = this.getWebSocketUrl();
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.state.connected = true;
          this.ws?.send(
            JSON.stringify({
              type: 'create_or_join_as_writer',
              payload: {
                sessionId,
                sessionName,
                taskId,
                writerName,
                deviceInfo,
                initialLogs: initialLogs.slice(-400),
              },
            })
          );
          this.startHeartbeat();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data, resolve);
        };

        this.ws.onerror = err => {
          console.error('WebSocket error in live session:', err);
          this.state.connected = false;
          this.notifyState();
          reject(err);
        };

        this.ws.onclose = () => {
          this.state.connected = false;
          this.stopHeartbeat();
          this.notifyState();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  public joinAsReader(sessionId: string, readerName: string): Promise<LiveSessionState> {
    return new Promise((resolve, reject) => {
      this.closeSocket();

      try {
        const url = this.getWebSocketUrl();
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.state.connected = true;
          this.ws?.send(
            JSON.stringify({
              type: 'join_room_as_reader',
              payload: {
                sessionId,
                readerName,
              },
            })
          );
          this.startHeartbeat();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data, resolve);
        };

        this.ws.onerror = err => {
          console.error('WebSocket reader connection error:', err);
          this.state.connected = false;
          this.notifyState();
          reject(err);
        };

        this.ws.onclose = () => {
          this.state.connected = false;
          this.stopHeartbeat();
          this.notifyState();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  private handleMessage(data: string, onJoinedResolver?: (state: LiveSessionState) => void) {
    try {
      const msg = JSON.parse(data);
      const { type, payload } = msg;

      switch (type) {
        case 'room_joined': {
          const { sessionId, role, participantId, room } = payload;
          this.state = {
            isLive: true,
            role: role as LiveRole,
            sessionId,
            sessionName: room.sessionName || `Live Session ${sessionId}`,
            taskId: room.taskId || 'TASK-DEBUG',
            writerName: room.writerName || 'Engineer A',
            writerId: room.writerId,
            deviceInfo: room.deviceInfo,
            participants: room.participants || [],
            connected: true,
            latencyMs: this.state.latencyMs,
          };
          this.notifyState();

          // If joining as reader and room has initial logs, emit them
          if (role === 'reader' && Array.isArray(room.recentLogs) && room.recentLogs.length > 0) {
            this.logsListeners.forEach(fn => fn(room.recentLogs));
          }

          if (onJoinedResolver) {
            onJoinedResolver(this.getState());
          }
          break;
        }

        case 'participant_joined': {
          const { participants, hasWriter, writerName } = payload;
          this.state.participants = participants || [];
          if (writerName) this.state.writerName = writerName;
          this.notifyState();
          break;
        }

        case 'participant_left': {
          const { participants, wasWriter, hasWriter } = payload;
          this.state.participants = participants || [];
          if (wasWriter) {
            this.state.writerId = null;
          }
          this.notifyState();
          break;
        }

        case 'logs_received': {
          const newLogs: LogEntry[] = payload.logs || [];
          if (newLogs.length > 0) {
            this.logsListeners.forEach(fn => fn(newLogs));
          }
          break;
        }

        case 'writer_command_injected': {
          this.state.lastWriterCommand = {
            command: payload.command,
            isHex: payload.isHex,
            timestamp: payload.timestamp,
            writerName: payload.writerName,
          };
          this.notifyState();
          this.commandListeners.forEach(fn => fn(payload));
          break;
        }

        case 'device_state_updated': {
          if (payload.deviceInfo) {
            this.state.deviceInfo = { ...this.state.deviceInfo, ...payload.deviceInfo };
          }
          if (payload.taskId) this.state.taskId = payload.taskId;
          if (payload.sessionName) this.state.sessionName = payload.sessionName;
          this.notifyState();
          break;
        }

        case 'logs_cleared': {
          this.logsClearListeners.forEach(fn => fn());
          break;
        }

        case 'pong': {
          const now = Date.now();
          if (payload?.timestamp) {
            this.state.latencyMs = Math.max(1, now - payload.timestamp);
            this.notifyState();
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling live message:', err);
    }
  }

  // Stream logs to all readers (writer role only)
  public streamLogs(logs: LogEntry[]) {
    if (!this.state.isLive || this.state.role !== 'writer' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.pendingLogQueue.push(...logs);

    if (this.pendingLogQueue.length >= 25) {
      this.flushLogs();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushLogs();
      }, 40);
    }
  }

  private flushLogs() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingLogQueue.length === 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const batch = [...this.pendingLogQueue];
    this.pendingLogQueue = [];

    this.ws.send(
      JSON.stringify({
        type: 'stream_logs',
        payload: { logs: batch },
      })
    );
  }

  // Broadcast command injected by writer
  public broadcastWriterCommand(command: string, isHex: boolean) {
    if (!this.state.isLive || this.state.role !== 'writer' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'writer_command_injected',
        payload: { command, isHex },
      })
    );
  }

  // Broadcast updated device state
  public updateDeviceState(deviceInfo: Partial<LiveDeviceInfo>, taskId?: string, sessionName?: string) {
    if (!this.state.isLive || this.state.role !== 'writer' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'update_device_state',
        payload: { deviceInfo, taskId, sessionName },
      })
    );
  }

  public requestClearLogs() {
    if (!this.state.isLive || this.state.role !== 'writer' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'request_clear_logs',
        payload: {},
      })
    );
  }

  public leaveSession() {
    this.closeSocket();
    this.state = {
      isLive: false,
      role: 'none',
      sessionId: null,
      sessionName: '',
      taskId: '',
      writerName: '',
      writerId: null,
      participants: [],
      connected: false,
      latencyMs: 0,
    };
    this.notifyState();

    // Clean URL query parameters if present
    if (typeof window !== 'undefined' && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('live');
      url.searchParams.delete('session');
      window.history.replaceState({}, '', url.toString());
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', payload: { timestamp: Date.now() } }));
      }
    }, 12000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private closeSocket() {
    this.stopHeartbeat();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingLogQueue = [];

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }
}

export const liveSessionClient = new LiveSessionClient();

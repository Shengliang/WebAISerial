/**
 * Firmware Image Serial Downloader & Automated Boot Capture Workflow
 * Implements:
 * 1. Image chunk download over serial (XMODEM / raw binary block streaming)
 * 2. Automated hardware power cycle (DTR/RTS strobe or reset command)
 * 3. Boot console log capture window
 * 4. Automatic save to IndexedDB keyed by Task ID and Session ID
 */

import {
  BootOutcome,
  FlashTransferState,
  LogEntry,
  TaskSessionRecord,
} from '../types';
import { indexedDBStorage } from './indexedDBStorage';
import { serialService } from './serialService';

export interface FlashWorkflowOptions {
  deviceId: string;
  deviceName: string;
  baudRate: number;
  taskId: string;
  sessionName?: string;
  engineerName?: string;
  imageFile: {
    name: string;
    size: number;
    data: Uint8Array;
    targetAddress?: string;
    versionTag?: string;
  };
  powerCycleMethod: 'dtr_rts_pulse' | 'command_reset' | 'manual_hardware';
  captureTimeoutMs?: number; // e.g. 5000ms - 10000ms
  onProgress?: (state: FlashTransferState) => void;
  onLogCaptured?: (log: LogEntry) => void;
}

export class FirmwareDownloaderEngine {
  private isCancelled = false;

  /**
   * Generates a standard Session ID based on current date & random hex
   */
  public static generateSessionId(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `SESS-${y}${m}${d}-${time}-${rand}`;
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Executes the complete daily firmware engineer workflow:
   * Download image -> Power cycle reboot -> Capture boot output -> Save to IndexedDB
   */
  public async runDownloadAndCapture(
    options: FlashWorkflowOptions
  ): Promise<TaskSessionRecord> {
    this.isCancelled = false;
    const {
      deviceId,
      deviceName,
      baudRate,
      taskId,
      imageFile,
      powerCycleMethod,
      engineerName = 'Firmware Engineer',
      captureTimeoutMs = 6000,
      onProgress,
    } = options;

    const sessionId = FirmwareDownloaderEngine.generateSessionId();
    const sessionStartTime = Date.now();
    const dateObj = new Date(sessionStartTime);
    const dateKey = dateObj.toISOString().split('T')[0];
    const monthKey = dateKey.substring(0, 7);

    // Initial state
    const state: FlashTransferState = {
      status: 'preparing',
      bytesTransferred: 0,
      totalBytes: imageFile.size,
      progressPercent: 0,
      speedBytesSec: 0,
      etaSeconds: 0,
      activeBlock: 0,
      totalBlocks: Math.ceil(imageFile.size / 1024),
      phaseMessage: `Preparing flash binary: ${imageFile.name} (${(imageFile.size / 1024).toFixed(1)} KB)...`,
    };

    if (onProgress) onProgress({ ...state });

    // Step 1: Transfer Image in Chunks
    state.status = 'transferring';
    const chunkSize = 1024; // 1 KB chunks
    const totalChunks = Math.ceil(imageFile.size / chunkSize);
    state.totalBlocks = totalChunks;

    const transferStartTime = Date.now();

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      if (this.isCancelled) {
        state.status = 'failed';
        state.phaseMessage = 'Flash download aborted by user.';
        if (onProgress) onProgress({ ...state });
        throw new Error('Flash download cancelled.');
      }

      const startByte = chunkIdx * chunkSize;
      const endByte = Math.min(startByte + chunkSize, imageFile.size);
      const chunk = imageFile.data.slice(startByte, endByte);

      // Send chunk via serial
      await serialService.send(deviceId, chunk);

      state.activeBlock = chunkIdx + 1;
      state.bytesTransferred = endByte;
      state.progressPercent = Math.round((endByte / imageFile.size) * 100);

      const elapsedSec = (Date.now() - transferStartTime) / 1000;
      if (elapsedSec > 0) {
        state.speedBytesSec = Math.round(endByte / elapsedSec);
        const remainingBytes = imageFile.size - endByte;
        state.etaSeconds = Math.max(0, Math.round(remainingBytes / state.speedBytesSec));
      }

      state.phaseMessage = `Downloading firmware image: Block ${state.activeBlock}/${totalChunks} (${state.progressPercent}%) at ${(state.speedBytesSec / 1024).toFixed(1)} KB/s`;

      if (onProgress) onProgress({ ...state });

      // Yield event loop to allow UI updates and simulate realistic flash write
      await new Promise(r => setTimeout(r, 20));
    }

    // Step 2: Power Cycle to Reboot
    state.status = 'rebooting';
    state.phaseMessage = 'Flashing complete. Triggering power cycle to reboot target hardware...';
    if (onProgress) onProgress({ ...state });

    if (powerCycleMethod === 'dtr_rts_pulse') {
      // Pulse RTS high, DTR low (ESP32 / Cortex reset sequence)
      await serialService.setSignals(deviceId, { rts: true, dtr: false });
      await new Promise(r => setTimeout(r, 120));
      await serialService.setSignals(deviceId, { rts: false, dtr: false });
    } else if (powerCycleMethod === 'command_reset') {
      await serialService.send(deviceId, 'reboot\r\n');
    }

    // Small delay for chip voltage stabilization
    await new Promise(r => setTimeout(r, 250));

    // Step 3: Capture Console Output
    state.status = 'capturing';
    state.phaseMessage = `Capturing boot console output for Task: ${taskId} (${sessionId})...`;
    if (onProgress) onProgress({ ...state });

    const capturedLogs: LogEntry[] = [];
    let bootOutcome: BootOutcome = 'IN_PROGRESS';

    const capturePromise = new Promise<void>(resolve => {
      const startTime = Date.now();

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        state.phaseMessage = `Capturing boot stream... (${(elapsed / 1000).toFixed(1)}s / ${(captureTimeoutMs / 1000).toFixed(1)}s)`;
        if (onProgress) onProgress({ ...state });

        if (elapsed >= captureTimeoutMs || this.isCancelled) {
          clearInterval(interval);
          if (bootOutcome === 'IN_PROGRESS') {
            bootOutcome = 'BOOT_SUCCESS'; // Completed without crash
          }
          resolve();
        }
      }, 200);

      // Hook temporary capture callback
      const previousCallback = serialService['onDataReceived'];
      serialService.setCallbacks((devId, text, rawBytes, direction) => {
        if (devId === deviceId && direction === 'RX') {
          const lower = text.toLowerCase();
          let level: LogEntry['level'] = 'INFO';

          if (
            lower.includes('error') ||
            lower.includes('panic') ||
            lower.includes('guru') ||
            lower.includes('hardfault') ||
            lower.includes('abort')
          ) {
            level = 'ERROR';
            if (lower.includes('panic') || lower.includes('guru')) {
              bootOutcome = 'CRASH_PANIC';
            } else if (lower.includes('hardfault')) {
              bootOutcome = 'HARDFAULT';
            }
          } else if (lower.includes('watchdog') || lower.includes('wdt')) {
            level = 'WARN';
            bootOutcome = 'WATCHDOG_RESET';
          } else if (lower.includes('boot:0x') || lower.includes('ready') || lower.includes('booted successfully')) {
            if (bootOutcome === 'IN_PROGRESS') {
              bootOutcome = 'BOOT_SUCCESS';
            }
          }

          const entry: LogEntry = {
            id: `log-${sessionId}-${capturedLogs.length + 1}`,
            timestamp: Date.now(),
            deviceId,
            deviceName,
            level,
            direction,
            text,
            rawBytes,
          };

          capturedLogs.push(entry);
          if (options.onLogCaptured) options.onLogCaptured(entry);
        }

        if (previousCallback) {
          previousCallback(devId, text, rawBytes, direction);
        }
      }, serialService['onDeviceUpdated']);
    });

    await capturePromise;

    // Step 4: Finalize and Save to IndexedDB
    const totalDuration = Date.now() - sessionStartTime;
    const errorCount = capturedLogs.filter(l => l.level === 'ERROR').length;
    const warnCount = capturedLogs.filter(l => l.level === 'WARN').length;
    const totalLogBytes = capturedLogs.reduce((acc, l) => acc + l.text.length, 0);

    const sessionRecord: TaskSessionRecord = {
      id: sessionId,
      taskId,
      sessionName: options.sessionName || `${taskId} Boot Run`,
      timestamp: sessionStartTime,
      dateKey,
      monthKey,
      deviceId,
      deviceName,
      baudRate,
      firmwareImage: {
        name: imageFile.name,
        size: imageFile.size,
        type: imageFile.name.endsWith('.hex') ? '.hex' : '.bin',
        targetAddress: imageFile.targetAddress || '0x10000',
        versionTag: imageFile.versionTag || 'v1.0.0',
        uploadTimestamp: transferStartTime,
      },
      powerCycleMethod,
      bootOutcome: bootOutcome === 'IN_PROGRESS' ? 'BOOT_SUCCESS' : bootOutcome,
      durationMs: totalDuration,
      logCount: capturedLogs.length,
      errorCount,
      warnCount,
      rawLogSize: totalLogBytes,
      logs: capturedLogs,
      engineerName,
      notes: `Image download (${(imageFile.size / 1024).toFixed(1)} KB) & power cycle boot test. Result: ${bootOutcome}`,
    };

    // Save permanently to Chrome's IndexedDB
    await indexedDBStorage.saveSession(sessionRecord);

    state.status = 'completed';
    state.phaseMessage = `Workflow complete! Session ${sessionId} saved to IndexedDB (Outcome: ${sessionRecord.bootOutcome}, Logs: ${capturedLogs.length}).`;
    if (onProgress) onProgress({ ...state });

    return sessionRecord;
  }
}

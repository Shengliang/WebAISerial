import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  HardDrive,
  Layers,
  Play,
  Power,
  RefreshCw,
  Square,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { FlashTransferState, SerialDevice, TaskSessionRecord } from '../types';
import { FirmwareDownloaderEngine } from '../utils/imageDownloader';

interface FirmwareFlasherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDevice: SerialDevice;
  onSessionCaptured?: (session: TaskSessionRecord) => void;
}

const PRESET_FIRMWARES = [
  {
    name: 'esp32s3_freertos_v2.5.0.bin',
    size: 420890,
    targetAddress: '0x10000',
    versionTag: 'v2.5.0',
    desc: 'ESP32-S3 FreeRTOS kernel with WiFi stack & telemetry daemon',
  },
  {
    name: 'stm32h743_can_controller.bin',
    size: 284500,
    targetAddress: '0x08000000',
    versionTag: 'v1.4.2',
    desc: 'STM32-H7 CAN bus & IMU sensor acquisition firmware',
  },
  {
    name: 'nrf52840_ble_beacon_app.bin',
    size: 195200,
    targetAddress: '0x26000',
    versionTag: 'v3.1.0',
    desc: 'Nordic nRF52840 Bluetooth Low Energy telemetry beacon',
  },
];

export const FirmwareFlasherModal: React.FC<FirmwareFlasherModalProps> = ({
  isOpen,
  onClose,
  activeDevice,
  onSessionCaptured,
}) => {
  const [taskId, setTaskId] = useState<string>(() => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `TASK-FW-${today}-01`;
  });
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    data: Uint8Array;
    targetAddress: string;
    versionTag: string;
  } | null>({
    name: PRESET_FIRMWARES[0].name,
    size: PRESET_FIRMWARES[0].size,
    data: new Uint8Array(PRESET_FIRMWARES[0].size),
    targetAddress: PRESET_FIRMWARES[0].targetAddress,
    versionTag: PRESET_FIRMWARES[0].versionTag,
  });

  const [powerCycleMethod, setPowerCycleMethod] = useState<
    'dtr_rts_pulse' | 'command_reset' | 'manual_hardware'
  >('dtr_rts_pulse');
  const [captureTimeoutSeconds, setCaptureTimeoutSeconds] = useState<number>(6);
  const [transferState, setTransferState] = useState<FlashTransferState | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [completedSession, setCompletedSession] = useState<TaskSessionRecord | null>(null);
  const [engineInstance, setEngineInstance] = useState<FirmwareDownloaderEngine | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      setSelectedFile({
        name: file.name,
        size: file.size,
        data: new Uint8Array(buffer),
        targetAddress: file.name.includes('stm') ? '0x08000000' : '0x10000',
        versionTag: 'v1.0.0',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSelectPreset = (preset: (typeof PRESET_FIRMWARES)[0]) => {
    setSelectedFile({
      name: preset.name,
      size: preset.size,
      data: new Uint8Array(preset.size),
      targetAddress: preset.targetAddress,
      versionTag: preset.versionTag,
    });
  };

  const handleStartDownloadAndReboot = async () => {
    if (!selectedFile) return;
    if (activeDevice.status !== 'connected') {
      alert('Please connect to the device or simulator port first.');
      return;
    }

    setIsExecuting(true);
    setCompletedSession(null);

    const engine = new FirmwareDownloaderEngine();
    setEngineInstance(engine);

    try {
      const session = await engine.runDownloadAndCapture({
        deviceId: activeDevice.id,
        deviceName: activeDevice.name,
        baudRate: activeDevice.config.baudRate,
        taskId: taskId.trim() || 'TASK-UNASSIGNED',
        imageFile: selectedFile,
        powerCycleMethod,
        captureTimeoutMs: captureTimeoutSeconds * 1000,
        onProgress: state => {
          setTransferState(state);
        },
      });

      setCompletedSession(session);
      if (onSessionCaptured) {
        onSessionCaptured(session);
      }
    } catch (err: any) {
      console.error('Download workflow failed:', err);
    } finally {
      setIsExecuting(false);
      setEngineInstance(null);
    }
  };

  const handleCancel = () => {
    if (engineInstance) {
      engineInstance.cancel();
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Serial Image Downloader & Power Cycle Reboot Workflow
              </h2>
              <p className="text-xs text-slate-400">
                Download binary image over serial console, power cycle target to reboot, and capture console boot log to IndexedDB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Daily Workflow Overview Banner */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-950 to-indigo-950/40 border border-cyan-800/40 rounded-xl p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-mono font-bold text-sm">
                1
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">Download Image</span>
                <span className="text-slate-400">Stream firmware binary blocks</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-sm">
                2
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">Power Cycle</span>
                <span className="text-slate-400">Pulse DTR/RTS reset line</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-sm">
                3
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">Capture Output</span>
                <span className="text-slate-400">Record boot output to task</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono font-bold text-sm">
                4
              </div>
              <div className="text-xs">
                <span className="font-semibold text-slate-200 block">Save IndexedDB</span>
                <span className="text-slate-400">60-month local storage</span>
              </div>
            </div>
          </div>

          {/* Form Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Task ID & Firmware Image Selection */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-cyan-400" />
                Task ID & Firmware Image Binary
              </h3>

              {/* Task ID Input */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Task Reference ID (JIRA / Issue / Sprint)</label>
                <input
                  type="text"
                  value={taskId}
                  onChange={e => setTaskId(e.target.value)}
                  placeholder="e.g. TASK-FW-2026-ESP32"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500 font-bold"
                />
              </div>

              {/* Upload custom binary file */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Upload Local Firmware Binary (.bin, .hex, .elf)</label>
                <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-lg p-3 text-center transition bg-slate-900/50">
                  <input
                    type="file"
                    id="fw-file"
                    accept=".bin,.hex,.elf,.ota,.img"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label htmlFor="fw-file" className="cursor-pointer flex flex-col items-center gap-1">
                    <Upload className="w-5 h-5 text-cyan-400" />
                    <span className="text-xs text-slate-300 font-medium">
                      {selectedFile ? selectedFile.name : 'Choose firmware file or drag here'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB (Target: ${selectedFile.targetAddress})`
                        : 'Supports binary images up to 32 MB'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Preset Test Builds */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-slate-400">Or select quick bench test build:</span>
                <div className="space-y-1">
                  {PRESET_FIRMWARES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`w-full p-2 rounded-lg border text-left text-xs transition flex items-center justify-between ${
                        selectedFile?.name === preset.name
                          ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="font-mono font-semibold text-[11px]">{preset.name}</div>
                        <div className="text-[10px] text-slate-500">{preset.desc}</div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {(preset.size / 1024).toFixed(0)} KB
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Power Cycle & Boot Capture Parameters */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Power className="w-4 h-4 text-amber-400" />
                Power Cycle & Boot Capture Parameters
              </h3>

              {/* Target Port Info */}
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <span className="text-slate-400 block text-[11px]">Active Debug Port:</span>
                  <span className="font-mono text-cyan-400 font-bold">{activeDevice.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Baud Rate:</span>
                  <span className="font-mono text-amber-400 font-bold">{activeDevice.config.baudRate} bps</span>
                </div>
              </div>

              {/* Power Cycle Method */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Reboot / Power Cycle Strobe Method</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPowerCycleMethod('dtr_rts_pulse')}
                    className={`p-2 rounded-lg border text-left text-xs transition ${
                      powerCycleMethod === 'dtr_rts_pulse'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">DTR/RTS Pin Pulse</div>
                    <div className="text-[10px] text-slate-500">Auto-pulse hardware EN & GPIO0 lines</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPowerCycleMethod('command_reset')}
                    className={`p-2 rounded-lg border text-left text-xs transition ${
                      powerCycleMethod === 'command_reset'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">Software Reset Command</div>
                    <div className="text-[10px] text-slate-500">Injects 'reboot' via UART console</div>
                  </button>
                </div>
              </div>

              {/* Capture Window Duration */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Console Boot Capture Window</span>
                  <span className="font-mono text-cyan-400 font-bold">{captureTimeoutSeconds} seconds</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={20}
                  value={captureTimeoutSeconds}
                  onChange={e => setCaptureTimeoutSeconds(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-[10px] text-slate-500 block">
                  Captures boot loader greeting, memory map, FreeRTOS initialization, and checks for kernel panics.
                </span>
              </div>

              {/* Target Partition Offset */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Flash Memory Target Offset</label>
                <input
                  type="text"
                  value={selectedFile?.targetAddress || '0x10000'}
                  onChange={e =>
                    setSelectedFile(prev => (prev ? { ...prev, targetAddress: e.target.value } : null))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Real-Time Execution State Bar */}
          {transferState && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {transferState.status === 'transferring' && (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  )}
                  {transferState.status === 'rebooting' && (
                    <Power className="w-4 h-4 text-amber-400 animate-pulse" />
                  )}
                  {transferState.status === 'capturing' && (
                    <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                  )}
                  {transferState.status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="font-mono text-slate-200">{transferState.phaseMessage}</span>
                </div>
                <span className="font-mono font-bold text-cyan-400">
                  {transferState.progressPercent}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    transferState.status === 'capturing'
                      ? 'bg-emerald-500'
                      : transferState.status === 'rebooting'
                      ? 'bg-amber-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${transferState.progressPercent}%` }}
                />
              </div>

              {/* Stats telemetry */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>
                  Block: {transferState.activeBlock} / {transferState.totalBlocks}
                </span>
                <span>Speed: {(transferState.speedBytesSec / 1024).toFixed(1)} KB/s</span>
                <span>ETA: {transferState.etaSeconds}s</span>
              </div>
            </div>
          )}

          {/* Completed Session Banner */}
          {completedSession && (
            <div className="bg-emerald-950/30 border border-emerald-800 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-semibold text-sm text-emerald-200">
                    Session Log Successfully Stored in IndexedDB!
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-900 text-emerald-300">
                    {completedSession.bootOutcome}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Task ID: <span className="text-cyan-400 font-bold">{completedSession.taskId}</span> | Session ID: <span className="text-amber-400 font-bold">{completedSession.id}</span> ({completedSession.logCount} console lines captured)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Storage Engine: <span className="font-mono text-emerald-400 font-semibold">Chrome IndexedDB (60-Month Retention)</span>
          </div>

          <div className="flex items-center gap-2">
            {isExecuting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Abort Workflow</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartDownloadAndReboot}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-cyan-950/50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Download Image &rarr; Power Cycle &rarr; Capture Log</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

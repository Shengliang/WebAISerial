import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  FileCheck,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderDown,
  HardDrive,
  Layers,
  Settings2,
  X,
} from 'lucide-react';
import { ExportOptions, LogEntry, SerialDevice, SessionAnalytics } from '../types';
import { downloadFile, generateExportContent } from '../utils/exportTools';
import { exportDirectlyToOfflineDiskFolder, exportToSqliteFile } from '../utils/sqliteExporter';
import { indexedDBStorage } from '../utils/indexedDBStorage';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  devices: SerialDevice[];
  sessionAnalytics: SessionAnalytics;
  onOpenArchive?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  logs,
  devices,
  sessionAnalytics,
  onOpenArchive,
}) => {
  const [format, setFormat] = useState<ExportOptions['format']>('markdown');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<ExportOptions['filterLevel']>('ALL');
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeHex, setIncludeHex] = useState(true);
  const [copied, setCopied] = useState(false);
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [autoExportThreshold, setAutoExportThreshold] = useState(500);

  const exportPayload = useMemo(() => {
    return generateExportContent(
      logs,
      {
        format,
        deviceId: selectedDeviceId,
        filterLevel,
        includeTimestamps,
        includeHex,
      },
      sessionAnalytics
    );
  }, [logs, format, selectedDeviceId, filterLevel, includeTimestamps, includeHex, sessionAnalytics]);

  const handleDownload = () => {
    downloadFile(exportPayload.content, exportPayload.filename, exportPayload.mimeType);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(exportPayload.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Automated Firmware Data Export & Analytics Report
              </h2>
              <p className="text-xs text-slate-400">
                Generate audit logs, CSV telemetry tables, canonical hex dumps, and markdown incident summaries
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

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Format Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setFormat('markdown')}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1.5 ${
                  format === 'markdown'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span className="text-xs font-semibold">Markdown</span>
                <span className="text-[10px] text-slate-500">Incident Report</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1.5 ${
                  format === 'csv'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-xs font-semibold">CSV</span>
                <span className="text-[10px] text-slate-500">Spreadsheet table</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1.5 ${
                  format === 'json'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span className="text-xs font-semibold">JSON</span>
                <span className="text-[10px] text-slate-500">Structured Audit</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('hex')}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1.5 ${
                  format === 'hex'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span className="text-xs font-semibold">Hex Dump</span>
                <span className="text-[10px] text-slate-500">Raw Byte Trace</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('txt')}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1.5 ${
                  format === 'txt'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs font-semibold">Plain Log</span>
                <span className="text-[10px] text-slate-500">Raw text stream</span>
              </button>
            </div>
          </div>

          {/* Filtering Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Target Device</label>
              <select
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                className="w-full bg-slate-900 text-slate-200 border border-slate-700 rounded p-1.5"
              >
                <option value="all">All Connected Devices</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.config.baudRate} baud)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Log Severity Level</label>
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value as ExportOptions['filterLevel'])}
                className="w-full bg-slate-900 text-slate-200 border border-slate-700 rounded p-1.5"
              >
                <option value="ALL">All Severities</option>
                <option value="ERROR">Errors Only</option>
                <option value="WARN">Warnings Only</option>
                <option value="INFO">Info & Higher</option>
                <option value="DEBUG">Debug & Higher</option>
              </select>
            </div>

            <div className="flex items-center gap-4 col-span-full pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={e => setIncludeTimestamps(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Include ISO microsecond timestamps</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={includeHex}
                  onChange={e => setIncludeHex(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Include raw hex frame values</span>
              </label>
            </div>
          </div>

          {/* Automated Data Logging Trigger Settings */}
          <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-slate-200">Automated Data Logging Trigger</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoExportEnabled}
                  onChange={e => setAutoExportEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">{autoExportEnabled ? 'Active' : 'Disabled'}</span>
              </label>
            </div>
            <p className="text-slate-400 text-[11px]">
              Automatically export and archive debug logs once buffer hits threshold, ensuring no memory loss during prolonged soak testing.
            </p>
            {autoExportEnabled && (
              <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                <span className="text-slate-400">Trigger export every</span>
                <input
                  type="number"
                  value={autoExportThreshold}
                  onChange={e => setAutoExportThreshold(parseInt(e.target.value, 10) || 500)}
                  className="w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-cyan-300"
                />
                <span className="text-slate-400">log lines or upon kernel panic</span>
              </div>
            )}
          </div>

          {/* 60-Month IndexedDB Archive & SQLite/Disk Tools */}
          <div className="bg-indigo-950/30 border border-indigo-800/60 rounded-lg p-3.5 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-slate-100">
                  Chrome IndexedDB 60-Month Archive &amp; Offline Storage
                </span>
              </div>
              {onOpenArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenArchive();
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-medium underline text-[11px]"
                >
                  Open 60-Mo Archive Explorer &rarr;
                </button>
              )}
            </div>
            <p className="text-slate-400 text-[11px]">
              Store daily firmware download sessions (~100/day across 60 months) with Task ID and Session ID indexing. Export complete historical datasets to SQLite database or directly stream to offline disk folders.
            </p>
          </div>

          {/* Preview Box */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">Preview ({exportPayload.filename})</span>
              <span>{exportPayload.content.length.toLocaleString()} characters</span>
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-emerald-400/90 max-h-40 overflow-auto whitespace-pre-wrap leading-relaxed">
              {exportPayload.content.slice(0, 1500)}
              {exportPayload.content.length > 1500 && '\n... [truncated preview]'}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-lg shadow-emerald-950/50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {exportPayload.filename}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

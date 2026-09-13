import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileCode,
  FileText,
  Filter,
  FolderDown,
  HardDrive,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { StorageQuotaInfo, TaskSessionRecord, TaskSummary } from '../types';
import { indexedDBStorage } from '../utils/indexedDBStorage';
import {
  exportDirectlyToOfflineDiskFolder,
  exportToNdjsonFile,
  exportToSqliteFile,
} from '../utils/sqliteExporter';

interface SessionArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSessionForTerminal?: (session: TaskSessionRecord) => void;
}

export const SessionArchiveModal: React.FC<SessionArchiveModalProps> = ({
  isOpen,
  onClose,
  onSelectSessionForTerminal,
}) => {
  const [sessions, setSessions] = useState<TaskSessionRecord[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Selected session for detail view
  const [activeSession, setActiveSession] = useState<TaskSessionRecord | null>(null);

  // Storage Quota
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo | null>(null);
  const [isPersisted, setIsPersisted] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  // Load data when modal opens or filter changes
  useEffect(() => {
    if (isOpen) {
      loadQuota();
      loadTasks();
      loadSessions();
    }
  }, [isOpen, selectedTaskId, selectedMonth, selectedOutcome, currentPage]);

  const loadQuota = async () => {
    try {
      const q = await indexedDBStorage.getStorageQuota();
      setQuotaInfo(q);
      setIsPersisted(q.isPersistent);
    } catch (err) {
      console.warn('Failed to load quota', err);
    }
  };

  const loadTasks = async () => {
    try {
      const t = await indexedDBStorage.getTasks();
      setTasks(t);
    } catch (err) {
      console.warn('Failed to load tasks', err);
    }
  };

  const loadSessions = async () => {
    setLoading(true);
    try {
      const res = await indexedDBStorage.querySessions({
        taskId: selectedTaskId || undefined,
        monthKey: selectedMonth || undefined,
        bootOutcome: selectedOutcome !== 'ALL' ? selectedOutcome : undefined,
        searchQuery: searchQuery.trim() || undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      });

      setSessions(res.items);
      setTotalCount(res.totalCount);
      if (res.items.length > 0 && !activeSession) {
        setActiveSession(res.items[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions from IndexedDB', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadSessions();
  };

  const handleSeedSampleData = async () => {
    setLoading(true);
    setExportMessage('Generating 120 sample test sessions across 60 months...');
    try {
      await indexedDBStorage.seedHistoricalData(120);
      await loadQuota();
      await loadTasks();
      await loadSessions();
      setExportMessage('Historical 60-month test data loaded into IndexedDB!');
      setTimeout(() => setExportMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await indexedDBStorage.requestPersistentStorage();
    setIsPersisted(granted);
    alert(
      granted
        ? 'Persistent storage granted by Chrome! Your 60-month debug archive is safe from browser cache eviction.'
        : 'Browser could not guarantee persistent storage at this time.'
    );
  };

  const handleExportSqlite = async () => {
    setIsExporting(true);
    setExportMessage('Generating SQLite 3 database schema and INSERT script...');
    try {
      // Fetch all matched sessions for full export
      const allRes = await indexedDBStorage.querySessions({
        taskId: selectedTaskId || undefined,
        monthKey: selectedMonth || undefined,
        bootOutcome: selectedOutcome !== 'ALL' ? selectedOutcome : undefined,
        limit: 10000,
        offset: 0,
      });

      exportToSqliteFile(allRes.items, `firmware_debug_${selectedTaskId || 'all'}`);
      setExportMessage(`SQLite database script exported successfully (${allRes.items.length} sessions)!`);
      setTimeout(() => setExportMessage(''), 3000);
    } catch (err: any) {
      alert('SQLite export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportNdjson = async () => {
    setIsExporting(true);
    try {
      const allRes = await indexedDBStorage.querySessions({
        taskId: selectedTaskId || undefined,
        monthKey: selectedMonth || undefined,
        limit: 10000,
      });

      exportToNdjsonFile(allRes.items, `firmware_archive_${selectedMonth || 'all'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportToDiskFolder = async () => {
    setIsExporting(true);
    setExportMessage('Opening offline disk directory selector...');
    try {
      const allRes = await indexedDBStorage.querySessions({
        taskId: selectedTaskId || undefined,
        monthKey: selectedMonth || undefined,
        limit: 10000,
      });

      const result = await exportDirectlyToOfflineDiskFolder(
        allRes.items,
        (processed, total, currentFile) => {
          setExportMessage(`Writing to disk: ${processed}/${total} - ${currentFile}`);
        }
      );

      if (result.success) {
        alert(
          `Successfully streamed ${result.filesWritten} firmware console session logs to disk folder: "${result.folderName}"!`
        );
      } else if (result.error && result.error !== 'User cancelled folder selection.') {
        alert('Disk export notice: ' + result.error);
      }
    } catch (err: any) {
      alert('Disk export error: ' + err.message);
    } finally {
      setIsExporting(false);
      setExportMessage('');
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm(`Delete session ${id} from IndexedDB?`)) return;
    await indexedDBStorage.deleteSession(id);
    await loadSessions();
    await loadQuota();
    if (activeSession?.id === id) {
      setActiveSession(null);
    }
  };

  if (!isOpen) return null;

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Generate 60 months list for quick jump dropdown (past 5 years)
  const monthOptions: string[] = [];
  const curr = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(curr.getFullYear(), curr.getMonth() - i, 1);
    const mStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    monthOptions.push(mStr);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base text-slate-100">
                  Task & Session Console Archive (Chrome IndexedDB)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                  60-Month Retention Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Search, inspect, and export daily firmware power-cycle boot sessions (~100 sessions/day) to SQLite & Offline Disk
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

        {/* Quota & Capacity Stats Bar */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-300">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>
                IndexedDB Storage:{' '}
                <strong className="text-cyan-300 font-mono">
                  {quotaInfo ? (quotaInfo.usageBytes / 1024 / 1024).toFixed(1) : 0} MB
                </strong>{' '}
                /{' '}
                <span className="text-slate-400 font-mono">
                  {quotaInfo ? (quotaInfo.quotaBytes / 1024 / 1024 / 1024).toFixed(0) : 50} GB
                </span>{' '}
                ({quotaInfo ? quotaInfo.usagePercent.toFixed(2) : 0}%)
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400 border-l border-slate-800 pl-3">
              <span>Saved Sessions:</span>
              <strong className="text-amber-400 font-mono font-bold">
                {quotaInfo?.totalSavedSessions.toLocaleString() || totalCount}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400 border-l border-slate-800 pl-3">
              <span>60-Mo Capacity:</span>
              <strong className="text-emerald-400 font-mono">
                ~{quotaInfo?.estimated60MonthCapacitySessions.toLocaleString() || '1,800,000'} runs
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isPersisted ? (
              <button
                type="button"
                onClick={handleRequestPersistence}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition border border-slate-700 flex items-center gap-1"
                title="Protect storage from Chrome automatic disk cleanup"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Protect from Eviction</span>
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-mono border border-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Persistent Storage Active</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleSeedSampleData}
              className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-[11px] font-medium transition border border-indigo-800 flex items-center gap-1"
              title="Populate test sessions across past 5 years"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Seed 60-Mo Test Runs</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center gap-2.5 text-xs">
          {/* Search text input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by Task ID, Session ID, or firmware..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </form>

          {/* Task Dropdown */}
          <select
            value={selectedTaskId}
            onChange={e => {
              setSelectedTaskId(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="">All Tasks ({tasks.length})</option>
            {tasks.map(t => (
              <option key={t.taskId} value={t.taskId}>
                {t.taskId} ({t.totalSessions} runs)
              </option>
            ))}
          </select>

          {/* Month Selector (60 months) */}
          <select
            value={selectedMonth}
            onChange={e => {
              setSelectedMonth(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
          >
            <option value="">60-Month Timeline (All)</option>
            {monthOptions.slice(0, 24).map(m => (
              <option key={m} value={m}>
                Month: {m}
              </option>
            ))}
          </select>

          {/* Boot Outcome */}
          <select
            value={selectedOutcome}
            onChange={e => {
              setSelectedOutcome(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">All Outcomes</option>
            <option value="BOOT_SUCCESS">Boot Success</option>
            <option value="CRASH_PANIC">Crash / Panic</option>
            <option value="WATCHDOG_RESET">Watchdog Reset</option>
            <option value="HARDFAULT">HardFault</option>
          </select>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Export to SQLite */}
            <button
              type="button"
              onClick={handleExportSqlite}
              disabled={isExporting || totalCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition text-xs shadow disabled:opacity-50"
              title="Export database schema and inserts to SQLite .sql script"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Export SQLite (.sql)</span>
            </button>

            {/* Export to Disk Folder */}
            <button
              type="button"
              onClick={handleExportToDiskFolder}
              disabled={isExporting || totalCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition text-xs shadow disabled:opacity-50"
              title="Stream logs directly into chosen hard drive folder"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span>Export to Offline Disk</span>
            </button>

            {/* Export NDJSON */}
            <button
              type="button"
              onClick={handleExportNdjson}
              disabled={isExporting || totalCount === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition text-xs border border-slate-700 disabled:opacity-50"
              title="Export NDJSON for long-term data warehousing"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>NDJSON</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="bg-indigo-950/80 border-b border-indigo-800 px-4 py-1.5 text-xs text-indigo-300 flex items-center gap-2 animate-fadeIn">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* Modal Main Body: 2-Pane View (Session List & Log Inspector) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Pane: Sessions List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/40">
            <div className="p-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>
                Found <strong className="text-slate-200">{totalCount}</strong> sessions
              </span>
              <span>
                Page {currentPage} of {totalPages}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-1.5 space-y-1">
              {loading && sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Loading sessions from IndexedDB...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs space-y-2">
                  <Database className="w-8 h-8 mx-auto text-slate-600" />
                  <p>No firmware sessions matched the filters.</p>
                  <button
                    onClick={handleSeedSampleData}
                    className="text-cyan-400 hover:text-cyan-300 underline text-xs"
                  >
                    Click to load 120 sample runs
                  </button>
                </div>
              ) : (
                sessions.map(s => {
                  const isSelected = activeSession?.id === s.id;
                  const isSuccess = s.bootOutcome === 'BOOT_SUCCESS';

                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveSession(s)}
                      className={`p-2.5 rounded-lg cursor-pointer transition text-left space-y-1 ${
                        isSelected
                          ? 'bg-indigo-950/60 border border-indigo-500 text-slate-100 shadow-sm'
                          : 'bg-slate-900/40 border border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-cyan-300 truncate">
                          {s.taskId}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                            isSuccess
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {isSuccess ? 'PASS' : s.bootOutcome.replace('BOOT_', '')}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 truncate">{s.id}</div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 font-mono">
                        <span>{new Date(s.timestamp).toLocaleDateString()}</span>
                        <span>{s.logCount} lines</span>
                        <span>{s.firmwareImage?.name || 'Manual'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-2 border-t border-slate-800 flex items-center justify-between text-xs bg-slate-950/80">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-slate-400 text-[11px] font-mono">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right Pane: Session Detail & Captured Console Log */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950/80">
            {activeSession ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Session Header Card */}
                <div className="p-4 border-b border-slate-800 space-y-2 bg-slate-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono text-base font-bold text-slate-100">
                          {activeSession.taskId}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            activeSession.bootOutcome === 'BOOT_SUCCESS'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}
                        >
                          {activeSession.bootOutcome}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Session: {activeSession.id} | Date:{' '}
                        {new Date(activeSession.timestamp).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(activeSession.id)}
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 transition"
                        title="Delete this session from IndexedDB"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Target Firmware:</span>
                      <span className="text-cyan-300 truncate block">
                        {activeSession.firmwareImage?.name || 'Raw Boot'}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Power Cycle Strobe:</span>
                      <span className="text-amber-300">{activeSession.powerCycleMethod}</span>
                    </div>

                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Console Output:</span>
                      <span className="text-slate-200">
                        {activeSession.logCount} lines ({activeSession.errorCount} errors)
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Engineer:</span>
                      <span className="text-indigo-300 truncate block">
                        {activeSession.engineerName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Console Log Terminal Window */}
                <div className="flex-1 min-h-0 flex flex-col p-4">
                  <div className="flex items-center justify-between pb-2 text-xs text-slate-400 font-mono">
                    <span>Captured Boot Console Output ({activeSession.logs.length} lines):</span>
                    <span>Baud: {activeSession.baudRate} bps</span>
                  </div>

                  <div className="flex-1 min-h-0 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1 select-text">
                    {activeSession.logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-slate-600 shrink-0 select-none">
                          {(i + 1).toString().padStart(3, '0')}
                        </span>
                        <span className="text-slate-500 shrink-0">
                          {new Date(log.timestamp).toISOString().split('T')[1].slice(0, 12)}
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            log.level === 'ERROR'
                              ? 'text-rose-400'
                              : log.level === 'WARN'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          [{log.level.padEnd(5)}]
                        </span>
                        <span
                          className={`flex-1 break-all ${
                            log.level === 'ERROR'
                              ? 'text-rose-300 font-semibold'
                              : log.level === 'WARN'
                              ? 'text-amber-300'
                              : 'text-emerald-300/90'
                          }`}
                        >
                          {log.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                <Database className="w-12 h-12 mb-2 text-slate-700" />
                <p className="text-sm">Select a firmware session from the list to view captured console logs.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

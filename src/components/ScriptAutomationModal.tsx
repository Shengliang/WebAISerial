import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  Play,
  Square,
  X,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { AutomationScript } from '../types';
import { defaultScripts, ScriptRunner } from '../utils/scriptRunner';

interface ScriptAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onRunScriptFinished?: () => void;
}

export const ScriptAutomationModal: React.FC<ScriptAutomationModalProps> = ({
  isOpen,
  onClose,
  activeDeviceId,
  onRunScriptFinished,
}) => {
  const [scripts, setScripts] = useState<AutomationScript[]>(defaultScripts);
  const [selectedScriptId, setSelectedScriptId] = useState<string>(defaultScripts[0].id);
  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [runnerInstance, setRunnerInstance] = useState<ScriptRunner | null>(null);

  if (!isOpen) return null;

  const currentScript = scripts.find(s => s.id === selectedScriptId) || scripts[0];

  const handleRunScript = async () => {
    if (!currentScript) return;
    setIsRunning(true);
    setProgressPercent(0);
    setProgressText('Starting automation execution...');

    const runner = new ScriptRunner();
    setRunnerInstance(runner);

    try {
      await runner.runScript(
        currentScript,
        activeDeviceId,
        (script, currentStep, totalSteps, stepMsg) => {
          setProgressText(stepMsg);
          const pct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
          setProgressPercent(pct);
          setScripts(prev => prev.map(s => (s.id === script.id ? { ...script } : s)));
        }
      );
    } finally {
      setIsRunning(false);
      setRunnerInstance(null);
      if (onRunScriptFinished) onRunScriptFinished();
    }
  };

  const handleStopScript = () => {
    if (runnerInstance) {
      runnerInstance.cancel();
      setIsRunning(false);
    }
  };

  const handleCreateNewScript = () => {
    const newScript: AutomationScript = {
      id: 'script-' + Date.now(),
      name: 'New Automation Routine',
      description: 'Custom automated serial injection test sequence',
      code: `# Custom Firmware Test Routine
LOG Starting test routine...
SEND help
SLEEP 500
WAIT Available commands
ASSERT status == OK
LOG Completed successfully!
`,
      status: 'idle',
    };
    setScripts(prev => [...prev, newScript]);
    setSelectedScriptId(newScript.id);
  };

  const handleUpdateCode = (newCode: string) => {
    setScripts(prev =>
      prev.map(s => (s.id === selectedScriptId ? { ...s, code: newCode } : s))
    );
  };

  const handleUpdateName = (name: string) => {
    setScripts(prev =>
      prev.map(s => (s.id === selectedScriptId ? { ...s, name } : s))
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Custom Script Automation & Test Suite
              </h2>
              <p className="text-xs text-slate-400">
                Execute automated regression test sequences, assert firmware responses, and log execution timing
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

        {/* Modal Body: Two Columns */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left: Script List */}
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-800 p-3 space-y-2 overflow-y-auto bg-slate-950/40">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Scripts
              </span>
              <button
                onClick={handleCreateNewScript}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {scripts.map(script => (
                <div
                  key={script.id}
                  onClick={() => setSelectedScriptId(script.id)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                    script.id === selectedScriptId
                      ? 'bg-indigo-950/50 border-indigo-500 text-slate-100 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-medium text-xs truncate">{script.name}</span>
                    {script.status === 'passed' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    {script.status === 'failed' && (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{script.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Code Editor & Execution Panel */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3 bg-slate-900/50">
            {/* Title & Description Edit */}
            <div className="space-y-1">
              <input
                type="text"
                value={currentScript.name}
                onChange={e => handleUpdateName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm font-semibold text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-xs text-slate-400">{currentScript.description}</p>
            </div>

            {/* Script Editor */}
            <div className="flex-1 flex flex-col min-h-0 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Script DSL: SEND, SEND_HEX, SLEEP &lt;ms&gt;, WAIT &lt;text&gt;, ASSERT, SIGNAL &lt;DTR|RTS&gt;</span>
              </div>
              <textarea
                value={currentScript.code}
                onChange={e => handleUpdateCode(e.target.value)}
                disabled={isRunning}
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-indigo-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                spellCheck={false}
              />
            </div>

            {/* Execution Status & Progress */}
            {isRunning && (
              <div className="space-y-1.5 bg-slate-950 p-2.5 rounded-lg border border-indigo-900/60 animate-pulse">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-indigo-300 font-mono">{progressText}</span>
                  <span className="text-indigo-400 font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Previous Run Results (if any) */}
            {currentScript.results && !isRunning && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5 max-h-32 overflow-y-auto font-mono">
                <div className="flex items-center justify-between font-sans">
                  <span className="font-semibold text-slate-300">Execution Output:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      currentScript.status === 'passed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : 'bg-rose-950 text-rose-300 border border-rose-700'
                    }`}
                  >
                    {currentScript.status.toUpperCase()} ({currentScript.results.durationMs}ms)
                  </span>
                </div>
                <div className="space-y-0.5 text-slate-400 text-[11px]">
                  {currentScript.results.log.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Target Port: <span className="font-mono text-cyan-400">{activeDeviceId}</span>
              </div>

              <div className="flex items-center gap-2">
                {isRunning ? (
                  <button
                    onClick={handleStopScript}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Script</span>
                  </button>
                ) : (
                  <button
                    onClick={handleRunScript}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition shadow-lg shadow-indigo-950/50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Automation Routine</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

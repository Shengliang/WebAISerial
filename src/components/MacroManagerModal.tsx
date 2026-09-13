import React, { useState } from 'react';
import { Plus, Trash2, X, Zap, Sparkles, Binary } from 'lucide-react';
import { CommandMacro } from '../types';

interface MacroManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  macros: CommandMacro[];
  onSaveMacros: (macros: CommandMacro[]) => void;
}

export const MacroManagerModal: React.FC<MacroManagerModalProps> = ({
  isOpen,
  onClose,
  macros,
  onSaveMacros,
}) => {
  const [list, setList] = useState<CommandMacro[]>(macros);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = () => {
    const newMacro: CommandMacro = {
      id: 'macro-' + Date.now(),
      name: 'Custom Cmd',
      command: 'sys info',
      isHex: false,
      shortcut: `Alt+${Math.min(list.length + 1, 9)}`,
      category: 'Custom',
      description: 'Custom command macro',
    };
    const updated = [...list, newMacro];
    setList(updated);
    setEditingId(newMacro.id);
  };

  const handleUpdate = (id: string, patch: Partial<CommandMacro>) => {
    const updated = list.map(m => (m.id === id ? { ...m, ...patch } : m));
    setList(updated);
  };

  const handleDelete = (id: string) => {
    const updated = list.filter(m => m.id !== id);
    setList(updated);
  };

  const handleSave = () => {
    onSaveMacros(list);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Quick Command Macros Manager
              </h2>
              <p className="text-xs text-slate-400">
                Configure 1-click injection buttons and Alt+1..8 keyboard shortcuts
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Configured Macros ({list.length})
            </span>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium px-2 py-1 rounded bg-cyan-950/60 border border-cyan-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Macro</span>
            </button>
          </div>

          <div className="space-y-2">
            {list.map((macro, idx) => (
              <div
                key={macro.id}
                className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 text-[10px] font-mono font-bold shrink-0">
                    Alt+{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={macro.name}
                    onChange={e => handleUpdate(macro.id, { name: e.target.value })}
                    placeholder="Macro Name"
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-semibold w-40"
                  />
                  <input
                    type="text"
                    value={macro.command}
                    onChange={e => handleUpdate(macro.id, { command: e.target.value })}
                    placeholder="Command or Hex"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(macro.id, { isHex: !macro.isHex })}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition border ${
                      macro.isHex
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    HEX
                  </button>
                  <button
                    onClick={() => handleDelete(macro.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition shadow"
          >
            Save Macros
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'Terminal & Command Injection',
      items: [
        { key: 'Enter / Ctrl+Enter', desc: 'Send command or hex packet to active device' },
        { key: 'Ctrl + K', desc: 'Quickly focus terminal command input line' },
        { key: 'Arrow Up / Down', desc: 'Navigate sent command history' },
        { key: 'Alt + 1..8', desc: 'Inject corresponding Quick Command Macro' },
        { key: 'Ctrl + L', desc: 'Clear current terminal buffer' },
        { key: 'Ctrl + P', desc: 'Pause or resume live log stream' },
      ],
    },
    {
      category: 'Views & Modals',
      items: [
        { key: 'Ctrl + Shift + H', desc: 'Toggle Canonical Hex Dump view mode' },
        { key: 'Ctrl + Shift + A', desc: 'Open Real-Time Session Analytics' },
        { key: 'Ctrl + Shift + S', desc: 'Open Script Automation Suite' },
        { key: 'Ctrl + Shift + E', desc: 'Open Automated Data Export tools' },
        { key: 'Ctrl + Shift + O', desc: 'Toggle Simulated Offline Field Mode' },
        { key: 'Escape', desc: 'Close any active modal dialog or clear focus' },
      ],
    },
    {
      category: 'Accessibility & Navigation',
      items: [
        { key: 'Tab / Shift + Tab', desc: 'Navigate focus through buttons, controls and tabs' },
        { key: 'Space / Enter', desc: 'Activate selected button or toggle' },
        { key: '?', desc: 'Show this keyboard shortcuts reference sheet' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Keyboard Shortcuts & Navigation Reference
              </h2>
              <p className="text-xs text-slate-400">
                Optimized for rapid bench workflows without needing a mouse
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {shortcuts.map((section, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="font-semibold uppercase tracking-wider text-slate-400 text-[11px]">
                {section.category}
              </h3>
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2">
                    <span className="text-slate-300">{item.desc}</span>
                    <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-[11px] font-bold shadow-inner">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Download,
  Monitor,
  X,
  ExternalLink,
  CheckCircle2,
  Apple,
  Chrome,
  Laptop,
  Compass,
  ArrowUpRight
} from 'lucide-react';

interface DesktopInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerInstall: () => Promise<void>;
  isInstallable: boolean;
  isInstalled: boolean;
  isInIframe: boolean;
}

export const DesktopInstallModal: React.FC<DesktopInstallModalProps> = ({
  isOpen,
  onClose,
  onTriggerInstall,
  isInstallable,
  isInstalled,
  isInIframe,
}) => {
  if (!isOpen) return null;

  const handleOpenDirect = () => {
    try {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                Install as Desktop Application
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                  PWA
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Run natively on your desktop without browser toolbars or distractions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Status / Quick Action banner */}
          {isInstalled ? (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-200">
                  Application Already Installed
                </p>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  You are running this application in native standalone desktop mode with local caching and offline capabilities.
                </p>
              </div>
            </div>
          ) : isInstallable ? (
            <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-cyan-200">
                    Ready to Install on this Device
                  </p>
                  <p className="text-xs text-slate-300">
                    Click below to trigger the native 1-click desktop installation prompt.
                  </p>
                </div>
              </div>
              <button
                onClick={onTriggerInstall}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 transition flex items-center justify-center gap-1.5 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Install App Now</span>
              </button>
            </div>
          ) : isInIframe ? (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 space-y-2">
              <div className="flex items-start gap-3">
                <ExternalLink className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-200">
                    Currently Viewing Inside Preview Frame
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    Browser security protocols prevent native install prompts inside embedded iframes. Open the app in its own browser window or tab to trigger the direct desktop installer.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleOpenDirect}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Open in Full Tab to Install</span>
                </button>
              </div>
            </div>
          ) : null}

          {/* Key Advantages Bento Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs mb-1">
                <Monitor className="w-4 h-4" />
                <span>Frameless Desktop</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Dedicated OS window, dock icon, desktop shortcut, and zero browser tab clutter.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>WebSerial Hardware</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Direct access to USB COM ports, FTDI, CH340, CP2102, and ARM Cortex simulator.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs mb-1">
                <Laptop className="w-4 h-4" />
                <span>Offline Caching</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Built-in Service Worker precaches all tools, symbols, and disassemblers offline.
              </p>
            </div>
          </div>

          {/* Browser Specific Desktop Instructions */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Desktop Installation Instructions by Browser
            </h4>

            {/* Google Chrome / Brave / Chromium */}
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Chrome className="w-4 h-4 text-cyan-400" />
                <span>Google Chrome, Brave, Arc & Chromium</span>
              </div>
              <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1 pl-1">
                <li>Look for the <strong className="text-slate-200">Install icon</strong> (computer screen with down arrow) on the right side of the address bar.</li>
                <li>Or click <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">⋮</kbd> Menu → <strong className="text-slate-200">Save and share</strong> → <strong className="text-slate-200">Install Embedded Firmware Serial Console...</strong></li>
                <li>Confirm by clicking <strong className="text-cyan-400">Install</strong>.</li>
              </ol>
            </div>

            {/* Microsoft Edge */}
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Monitor className="w-4 h-4 text-blue-400" />
                <span>Microsoft Edge (Windows & macOS)</span>
              </div>
              <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1 pl-1">
                <li>Click the <strong className="text-slate-200">App Available</strong> icon in the address bar.</li>
                <li>Or click <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">…</kbd> Menu → <strong className="text-slate-200">Apps</strong> → <strong className="text-slate-200">Install this site as an app</strong>.</li>
                <li>Optionally pin to Taskbar, Start Menu, or Desktop.</li>
              </ol>
            </div>

            {/* Apple Safari on macOS Sonoma / Sequoia */}
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Apple className="w-4 h-4 text-slate-300" />
                <span>Safari on macOS (Sonoma & newer)</span>
              </div>
              <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1 pl-1">
                <li>Open the app in Safari.</li>
                <li>Click <strong className="text-slate-200">File</strong> in the macOS menu bar → <strong className="text-slate-200">Add to Dock…</strong></li>
                <li>Click <strong className="text-cyan-400">Add</strong> to launch it as a standalone Mac application.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Compass className="w-3.5 h-3.5 text-slate-500" />
            <span>Progressive Web App (PWA) Standard</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  LogOut,
  Radio,
  Share2,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { LiveSessionState } from '../types';

interface LiveSessionBannerProps {
  liveState: LiveSessionState;
  onOpenLiveModal: () => void;
  onLeaveSession: () => void;
}

export const LiveSessionBanner: React.FC<LiveSessionBannerProps> = ({
  liveState,
  onOpenLiveModal,
  onLeaveSession,
}) => {
  const [copied, setCopied] = useState(false);

  if (!liveState.isLive) return null;

  const isWriter = liveState.role === 'writer';
  const readerCount = liveState.participants.filter(p => p.role === 'reader').length;

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('live', liveState.sessionId || '');
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="live-session-banner"
      className={`w-full border-b px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
        isWriter
          ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
      }`}
    >
      {/* Left side: Live indicator and role */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isWriter ? 'bg-rose-400' : 'bg-emerald-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isWriter ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
            />
          </span>
          <span className={isWriter ? 'text-rose-400' : 'text-emerald-400'}>
            {isWriter ? 'Host Live Broadcast' : 'Live Observer Mode'}
          </span>
        </div>

        <div className="h-3 w-px bg-slate-700 hidden sm:block" />

        <div className="flex items-center gap-2 truncate">
          <span className="font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px]">
            {liveState.sessionId}
          </span>
          <span className="text-slate-400 hidden md:inline truncate">
            {liveState.sessionName}
          </span>
          {liveState.taskId && (
            <span className="text-slate-400 hidden lg:inline font-mono text-[10px]">
              [{liveState.taskId}]
            </span>
          )}
        </div>
      </div>

      {/* Middle: Host & Audience Info */}
      <div className="flex items-center gap-3">
        {isWriter ? (
          <div className="flex items-center gap-1.5 text-slate-300">
            <Users className="w-3.5 h-3.5 text-rose-400" />
            <span>
              <strong>{readerCount}</strong> {readerCount === 1 ? 'reader' : 'readers'} watching live
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-300">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Host: <strong className="text-slate-100">{liveState.writerName || 'Engineer A'}</strong> (Writer)
            </span>
            <span className="hidden sm:inline text-slate-400">• Read-Only Stream</span>
          </div>
        )}

        {liveState.connected && (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="font-mono">{liveState.latencyMs}ms</span>
          </div>
        )}
      </div>

      {/* Right side: Quick actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition"
          title="Copy shareable link for team members anywhere in the web"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Link Copied</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Share Link</span>
            </>
          )}
        </button>

        <button
          onClick={onOpenLiveModal}
          className="px-2.5 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition"
        >
          Session Info
        </button>

        <button
          onClick={onLeaveSession}
          className={`flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition ${
            isWriter
              ? 'bg-rose-950/80 hover:bg-rose-900 border-rose-700 text-rose-200'
              : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-rose-300'
          }`}
          title={isWriter ? 'Stop broadcasting live to readers' : 'Exit live observer view and return to local terminal'}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{isWriter ? 'End Broadcast' : 'Leave Live'}</span>
        </button>
      </div>
    </div>
  );
};

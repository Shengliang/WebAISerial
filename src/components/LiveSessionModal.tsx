import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  HelpCircle,
  Layers,
  Link,
  LogOut,
  Radio,
  RefreshCw,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  User,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { LiveRoomSummary, LiveSessionState, SerialDevice } from '../types';
import { liveSessionClient } from '../utils/liveSessionClient';

interface LiveSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveState: LiveSessionState;
  activeDevice: SerialDevice | null;
  currentUserName: string;
  defaultTaskId: string;
  onStartBroadcasting: (sessionId: string, sessionName: string, taskId: string) => void;
  onJoinAsReader: (sessionId: string, readerName: string) => void;
  onLeaveSession: () => void;
}

export const LiveSessionModal: React.FC<LiveSessionModalProps> = ({
  isOpen,
  onClose,
  liveState,
  activeDevice,
  currentUserName,
  defaultTaskId,
  onStartBroadcasting,
  onJoinAsReader,
  onLeaveSession,
}) => {
  const [activeTab, setActiveTab] = useState<'broadcast' | 'join' | 'architecture'>('broadcast');

  // Broadcast form state
  const [broadcastSessionId, setBroadcastSessionId] = useState(
    () => `DEBUG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [broadcastTitle, setBroadcastTitle] = useState('Firmware UART Debug & Log Stream');
  const [broadcastTaskId, setBroadcastTaskId] = useState(defaultTaskId || 'TASK-FW-2026-0913');
  const [writerName, setWriterName] = useState(currentUserName || 'Engineer A');

  // Join form state
  const [joinSessionId, setJoinSessionId] = useState('');
  const [readerName, setReaderName] = useState(
    currentUserName ? `${currentUserName} (Reader)` : 'Engineer B (Reader)'
  );

  // Active rooms from server
  const [activeRooms, setActiveRooms] = useState<LiveRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Fetch available rooms
  const fetchActiveRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/live-rooms');
      if (res.ok) {
        const data = await res.json();
        setActiveRooms(data.rooms || []);
      }
    } catch (e) {
      console.error('Failed to fetch active rooms:', e);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchActiveRooms();
      if (liveState.isLive) {
        setActiveTab('broadcast');
      }
    }
  }, [isOpen, liveState.isLive]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('live', liveState.sessionId || broadcastSessionId);
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(liveState.sessionId || broadcastSessionId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleStartBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSessionId.trim()) return;
    onStartBroadcasting(
      broadcastSessionId.trim().toUpperCase(),
      broadcastTitle.trim(),
      broadcastTaskId.trim()
    );
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinSessionId.trim()) return;
    onJoinAsReader(joinSessionId.trim().toUpperCase(), readerName.trim());
  };

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?live=${liveState.sessionId || broadcastSessionId}`
    : '';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base text-slate-100">
                  Live Serial Console Sharing
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
                  1 Writer • N Readers
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Stream serial logs in real time from Engineer A to team members anywhere on the web
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-950/40 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'broadcast'
                ? 'bg-rose-950/60 text-rose-300 font-medium border border-rose-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              {liveState.isLive && liveState.role === 'writer'
                ? 'Active Broadcast (Host)'
                : 'Host / Share Session (Writer)'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('join')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'join'
                ? 'bg-emerald-950/60 text-emerald-300 font-medium border border-emerald-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {liveState.isLive && liveState.role === 'reader'
                ? 'Active Observer View'
                : 'Join Team Session (Reader)'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'architecture'
                ? 'bg-indigo-950/60 text-indigo-300 font-medium border border-indigo-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>1-Writer N-Reader Architecture</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          {/* TAB 1: BROADCAST / HOST (Writer) */}
          {activeTab === 'broadcast' && (
            <div className="space-y-4">
              {liveState.isLive && liveState.role === 'writer' ? (
                /* Currently Broadcasting */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
                        </span>
                        <span>Broadcasting Live to Web</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {liveState.participants.length} Active in Room
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400">Session Code:</span>
                        <div className="font-mono font-bold text-slate-100 mt-0.5">
                          {liveState.sessionId}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Task Reference:</span>
                        <div className="font-mono text-cyan-300 mt-0.5">
                          {liveState.taskId}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Active Serial Port:</span>
                        <div className="text-slate-200 mt-0.5">
                          {activeDevice?.name || 'ESP32 Serial Device'} ({activeDevice?.baudRate || 115200} bps)
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">WebSocket Latency:</span>
                        <div className="font-mono text-emerald-400 mt-0.5">
                          {liveState.latencyMs} ms
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shareable Link Box */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">
                      Shareable Live Session URL:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-[11px] text-cyan-300 select-all"
                      />
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition whitespace-nowrap"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Send this link to team members anywhere on the internet. They can open it in any browser to watch your console logs live.
                    </p>
                  </div>

                  {/* Connected Team Members List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-rose-400" />
                        <span>Connected Room Members ({liveState.participants.length})</span>
                      </h4>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-44 overflow-y-auto">
                      {liveState.participants.map(p => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                p.role === 'writer' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                              }`}
                            />
                            <span className="font-medium text-slate-200">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                p.role === 'writer'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {p.role === 'writer' ? 'WRITER / HOST' : 'READER'}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {new Date(p.joinedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={onLeaveSession}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-200 font-medium transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Stop Live Broadcast</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Not currently broadcasting -> Start form */
                <form onSubmit={handleStartBroadcast} className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold">
                      <Zap className="w-4 h-4 text-rose-400" />
                      <span>Start a Shared Live Debug Session</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      As <strong className="text-slate-200">Engineer A (Writer)</strong>, your serial port communications will stream live to remote team members anywhere across the network. Only you control the hardware serial port.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Session Code / ID:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={broadcastSessionId}
                          onChange={e => setBroadcastSessionId(e.target.value.toUpperCase())}
                          required
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-cyan-300"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setBroadcastSessionId(
                              `DEBUG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
                            )
                          }
                          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300"
                          title="Generate new random session code"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-medium">Task ID (JIRA / Issue):</label>
                      <input
                        type="text"
                        value={broadcastTaskId}
                        onChange={e => setBroadcastTaskId(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-amber-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Session Title / Topic:</label>
                    <input
                      type="text"
                      value={broadcastTitle}
                      onChange={e => setBroadcastTitle(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Host Engineer Name:</label>
                    <input
                      type="text"
                      value={writerName}
                      onChange={e => setWriterName(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                    />
                  </div>

                  {/* Device Preview */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] flex items-center justify-between">
                    <div>
                      <span className="text-slate-400">Attached Serial Device:</span>
                      <div className="font-semibold text-slate-200 mt-0.5">
                        {activeDevice ? activeDevice.name : 'Virtual Bench Simulator'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400">Configured Baud:</span>
                      <div className="font-mono text-cyan-300 mt-0.5">
                        {activeDevice ? `${activeDevice.baudRate} bps` : '115200 bps'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-lg shadow-rose-900/30 transition"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Start Live Broadcast</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: JOIN AS READER */}
          {activeTab === 'join' && (
            <div className="space-y-4">
              {liveState.isLive && liveState.role === 'reader' ? (
                /* Currently observing */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                        </span>
                        <span>Watching Live Console Stream</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                        READER / OBSERVER
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400">Host (Writer):</span>
                        <div className="font-semibold text-slate-100 mt-0.5">
                          {liveState.writerName || 'Engineer A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Room Code:</span>
                        <div className="font-mono text-cyan-300 mt-0.5">
                          {liveState.sessionId}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Task Reference:</span>
                        <div className="font-mono text-amber-300 mt-0.5">
                          {liveState.taskId}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Host Baud Rate:</span>
                        <div className="font-mono text-slate-200 mt-0.5">
                          {liveState.deviceInfo?.baudRate || 115200} bps
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Safe Read-Only Isolation Active</span>
                    </div>
                    <p>
                      You are observing the live serial output received by the host. All write actions (command injection, baud modification, hardware reset strobe) are reserved for the host to prevent accidental MCU bus conflicts.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={onLeaveSession}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Leave Live Stream</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Join Form */
                <div className="space-y-4">
                  <form onSubmit={handleJoinSession} className="space-y-3">
                    <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-200 font-semibold">
                        <Eye className="w-4 h-4 text-emerald-400" />
                        <span>Join an Existing Live Debug Room</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Enter the session code shared by your teammate, or choose an active session from the lab list below.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-medium">Session Code / ID:</label>
                        <input
                          type="text"
                          placeholder="e.g. DEBUG-2026-9812"
                          value={joinSessionId}
                          onChange={e => setJoinSessionId(e.target.value.toUpperCase())}
                          required
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-cyan-300 uppercase"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-300 font-medium">Your Display Name:</label>
                        <input
                          type="text"
                          value={readerName}
                          onChange={e => setReaderName(e.target.value)}
                          required
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shadow-lg shadow-emerald-950/40"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Join as Live Reader</span>
                    </button>
                  </form>

                  {/* Active Lab Sessions Table */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <span>Discovered Active Live Sessions ({activeRooms.length})</span>
                      </h4>
                      <button
                        onClick={fetchActiveRooms}
                        disabled={loadingRooms}
                        className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingRooms ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {activeRooms.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-slate-400 text-xs">
                        No active broadcast sessions found on this server. Start one using the Host tab!
                      </div>
                    ) : (
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-48 overflow-y-auto">
                        {activeRooms.map(room => (
                          <div
                            key={room.sessionId}
                            className="p-2.5 flex items-center justify-between hover:bg-slate-900/50 transition gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-slate-200">
                                  {room.sessionId}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-900 text-cyan-400 rounded border border-slate-800">
                                  {room.taskId}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                Host: <strong className="text-slate-300">{room.writerName}</strong> • {room.participantCount} watching
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                setJoinSessionId(room.sessionId);
                                onJoinAsReader(room.sessionId, readerName);
                              }}
                              className="px-3 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded font-medium text-xs whitespace-nowrap transition"
                            >
                              Join Live
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ARCHITECTURE & SECURITY */}
          {activeTab === 'architecture' && (
            <div className="space-y-3 leading-relaxed text-slate-300 text-xs">
              <h3 className="text-sm font-semibold text-indigo-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Single Writer, N-Readers Live Collaboration Model
              </h3>
              <p>
                Embedded hardware serial buses (UART/RS-232/USB-CDC) are strictly physical point-to-point electrical lines. If multiple remote users simultaneously injected commands over the TX line, race conditions, buffer corruptions, and corrupted microcontroller state would occur.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-rose-400 font-semibold flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5" />
                    <span>The Single Writer (Host)</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Controls the physical WebSerial port on their local machine.</li>
                    <li>Transmits commands, adjusts baud rate, resets MCU via DTR/RTS lines.</li>
                    <li>RX byte streams and sent TX commands are broadcast to the room.</li>
                  </ul>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>The N-Readers (Audience)</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Can join from any web browser worldwide via room link or ID.</li>
                    <li>No hardware or drivers required on readers' computers.</li>
                    <li>Receive live serial console output with sub-50ms latency.</li>
                    <li>Protected read-only mode prevents accidental disruption.</li>
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-[11px]">
                <h4 className="font-semibold text-slate-200">Real-Time WebSocket Protocol:</h4>
                <p className="text-slate-400">
                  Backed by an integrated Node.js WebSocket server on port 3000. Incoming serial chunks are batched into framed messages and fanned out to all connected WebSocket clients with automatic keep-alive heartbeats and presence tracking.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

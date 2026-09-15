import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LogEntry, SerialDevice, SessionAnalytics } from '../types';

interface AnalyticsDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  devices: SerialDevice[];
  sessionAnalytics: SessionAnalytics;
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: '#22c55e',
  WARN: '#f59e0b',
  ERROR: '#ef4444',
  DEBUG: '#94a3b8',
  COMMAND: '#6366f1',
  RAW: '#06b6d4',
};

export const AnalyticsDashboardModal: React.FC<AnalyticsDashboardModalProps> = ({
  isOpen,
  onClose,
  logs,
  devices,
  sessionAnalytics,
}) => {
  // Compute log severity distribution
  const severityData = useMemo(() => {
    const counts: Record<string, number> = {
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      DEBUG: 0,
      COMMAND: 0,
    };

    logs.forEach(l => {
      if (counts[l.level] !== undefined) {
        counts[l.level]++;
      } else {
        counts.INFO++;
      }
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0);
  }, [logs]);

  // Compute device data breakdown
  const deviceBreakdown = useMemo(() => {
    return devices.map(d => ({
      name: d.name,
      rxKB: +(d.rxBytesTotal / 1024).toFixed(2),
      txKB: +(d.txBytesTotal / 1024).toFixed(2),
      baudRate: d.config.baudRate,
    }));
  }, [devices]);

  if (!isOpen) return null;

  // Total metrics
  const totalLogs = logs.length;
  const totalErrors = logs.filter(l => l.level === 'ERROR').length;
  const totalWarnings = logs.filter(l => l.level === 'WARN').length;
  const totalRxBytes = devices.reduce((acc, d) => acc + d.rxBytesTotal, 0);
  const totalTxBytes = devices.reduce((acc, d) => acc + d.txBytesTotal, 0);
  const errorRatePct = totalLogs > 0 ? ((totalErrors / totalLogs) * 100).toFixed(2) : '0.00';

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-slate-100">
                Session Analytics & Real-Time Telemetry
              </h2>
              <p className="text-xs text-slate-400">
                Data throughput trends, buffer performance, error distribution, and multi-device bandwidth metrics
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

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metric Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Logs */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Total Streamed Logs</span>
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {totalLogs.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500">Captured in ring buffer</p>
            </div>

            {/* Error Frequency */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Error Frequency</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-rose-400">
                {totalErrors}{' '}
                <span className="text-xs font-normal text-slate-400">({errorRatePct}%)</span>
              </div>
              <p className="text-[11px] text-amber-500/90">{totalWarnings} warnings flagged</p>
            </div>

            {/* Total Ingress RX */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Ingress Data (RX)</span>
                <ArrowDownRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {(totalRxBytes / 1024).toFixed(1)} <span className="text-xs text-slate-400">KB</span>
              </div>
              <p className="text-[11px] text-slate-500">From UART receivers</p>
            </div>

            {/* Total Egress TX */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Egress Data (TX)</span>
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {(totalTxBytes / 1024).toFixed(1)} <span className="text-xs text-slate-400">KB</span>
              </div>
              <p className="text-[11px] text-slate-500">Injected firmware frames</p>
            </div>
          </div>

          {/* Real-time Throughput Waveform (Recharts AreaChart) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-sm text-slate-200">
                  Throughput Waveform (Bytes/sec over Time)
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> RX Stream
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> TX Stream
                </span>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={
                    sessionAnalytics.throughputSamples.length > 0
                      ? sessionAnalytics.throughputSamples
                      : [
                          { time: '10:00', rxBps: 240, txBps: 30 },
                          { time: '10:01', rxBps: 1850, txBps: 120 },
                          { time: '10:02', rxBps: 3400, txBps: 90 },
                          { time: '10:03', rxBps: 5200, txBps: 340 },
                          { time: '10:04', rxBps: 2100, txBps: 80 },
                        ]
                  }
                >
                  <defs>
                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rxBps"
                    name="RX Bytes/s"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorRx)"
                  />
                  <Area
                    type="monotone"
                    dataKey="txBps"
                    name="TX Bytes/s"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorTx)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Two-Column Analytics: Severity Distribution & Multi-Device Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Severity Distribution Pie */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-slate-200">Log Severity Distribution</h3>
              </div>

              <div className="h-48 w-full flex items-center justify-center">
                {severityData.length === 0 ? (
                  <div className="text-slate-500 text-xs">No logs recorded yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={40}
                        paddingAngle={3}
                      >
                        {severityData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={SEVERITY_COLORS[entry.name] || '#06b6d4'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend fontSize={11} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Device Bandwidth Bar Chart */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-sm text-slate-200">
                  Device Bandwidth (RX/TX in KB)
                </h3>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deviceBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="rxKB" name="RX (KB)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="txKB" name="TX (KB)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

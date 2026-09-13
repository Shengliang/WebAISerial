import React, { useMemo, useState } from 'react';
import { Copy, Check, Search, Download, Hash } from 'lucide-react';
import { LogEntry } from '../types';
import { formatToHexDump, stringToBytes } from '../utils/hexFormatter';

interface HexDumpViewerProps {
  logs: LogEntry[];
  activeDeviceId: string;
}

export const HexDumpViewer: React.FC<HexDumpViewerProps> = ({ logs, activeDeviceId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [bytesPerLine, setBytesPerLine] = useState<16 | 8>(16);

  // Aggregate raw bytes from active device's logs
  const allBytes = useMemo(() => {
    const deviceLogs = logs.filter(l => l.deviceId === activeDeviceId);
    const byteArrays: number[] = [];
    
    // Take recent logs up to 10KB to preserve 60fps high throughput
    const recent = deviceLogs.slice(-150);
    for (const log of recent) {
      if (log.rawBytes && log.rawBytes.length > 0) {
        byteArrays.push(...log.rawBytes);
      } else {
        byteArrays.push(...stringToBytes(log.text));
      }
    }
    return byteArrays;
  }, [logs, activeDeviceId]);

  const hexLines = useMemo(() => {
    return formatToHexDump(allBytes, bytesPerLine);
  }, [allBytes, bytesPerLine]);

  // Filtered lines if search term given
  const filteredLines = useMemo(() => {
    if (!searchTerm.trim()) return hexLines;
    const term = searchTerm.toLowerCase();
    return hexLines.filter(line => {
      const hexStr = line.hexBytes.join(' ').toLowerCase();
      const asciiStr = line.ascii.toLowerCase();
      const offsetStr = line.offset.toLowerCase();
      return hexStr.includes(term) || asciiStr.includes(term) || offsetStr.includes(term);
    });
  }, [hexLines, searchTerm]);

  const handleCopyAsCArray = () => {
    const cArray = `const uint8_t firmware_dump[${allBytes.length}] = {\n  ` +
      allBytes.map((b, i) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}${i < allBytes.length - 1 ? ', ' : ''}${i % 12 === 11 ? '\n  ' : ''}`).join('') +
      `\n};`;
    navigator.clipboard.writeText(cArray);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 font-mono text-xs select-text overflow-hidden">
      {/* Top Hex Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100">Canonical Hex Dump</span>
          <span className="text-slate-500 text-[11px]">({allBytes.length} bytes loaded)</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter hex/ascii..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded pl-6 pr-2 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-36"
            />
          </div>

          {/* Bytes per line toggle */}
          <div className="flex items-center bg-slate-950 rounded border border-slate-800 p-0.5">
            <button
              onClick={() => setBytesPerLine(16)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                bytesPerLine === 16 ? 'bg-cyan-950 text-cyan-300' : 'text-slate-400'
              }`}
            >
              16 BPL
            </button>
            <button
              onClick={() => setBytesPerLine(8)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                bytesPerLine === 8 ? 'bg-cyan-950 text-cyan-300' : 'text-slate-400'
              }`}
            >
              8 BPL
            </button>
          </div>

          {/* Copy C-Array */}
          <button
            onClick={handleCopyAsCArray}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition border border-slate-700"
            title="Export bytes as C/C++ uint8_t[] array"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            <span>{copied ? 'Copied!' : 'Copy C Array'}</span>
          </button>
        </div>
      </div>

      {/* Hex Dump Content Table */}
      <div className="flex-1 overflow-auto p-3 font-mono text-[11.5px] leading-5 space-y-0.5">
        {filteredLines.length === 0 ? (
          <div className="text-slate-500 text-center py-8">
            No bytes captured yet. Connect to a port or boot simulator to stream raw bytes.
          </div>
        ) : (
          filteredLines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-3 hover:bg-slate-900/60 px-1 rounded transition-colors">
              {/* Offset Column */}
              <span className="text-slate-500 select-none w-20 shrink-0 font-semibold">
                {line.offset}
              </span>

              {/* Hex Bytes Column */}
              <div className="flex items-center gap-1.5 shrink-0 text-cyan-300">
                <span className="tracking-widest">
                  {line.hexBytes.slice(0, 8).join(' ')}
                </span>
                {line.hexBytes.length > 8 && (
                  <>
                    <span className="text-slate-700 select-none">|</span>
                    <span className="tracking-widest">
                      {line.hexBytes.slice(8).join(' ')}
                    </span>
                  </>
                )}
              </div>

              {/* ASCII Preview Column */}
              <div className="text-emerald-400/90 pl-3 border-l border-slate-800 select-all font-mono">
                {line.ascii}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

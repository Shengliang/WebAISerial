/**
 * Automated Data Export Tools for Firmware Debugging & Long-term Analytics
 * Formats: Plain Text (.log), CSV (.csv), JSON Audit (.json), Hex Dump (.hex), Markdown Report (.md)
 */

import { ExportOptions, LogEntry, SessionAnalytics } from '../types';
import { stripAnsi } from './ansi';
import { bytesToHexString } from './hexFormatter';

export function generateExportContent(
  logs: LogEntry[],
  options: ExportOptions,
  analytics?: SessionAnalytics
): { content: string; filename: string; mimeType: string } {
  const filtered = logs.filter(l => {
    if (options.deviceId && options.deviceId !== 'all' && l.deviceId !== options.deviceId) {
      return false;
    }
    if (options.filterLevel && options.filterLevel !== 'ALL' && l.level !== options.filterLevel) {
      return false;
    }
    return true;
  });

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

  if (options.format === 'csv') {
    const headers = ['Timestamp', 'ISO_Time', 'Device', 'Direction', 'Level', 'Payload', 'Hex'];
    const rows = filtered.map(l => {
      const date = new Date(l.timestamp).toISOString();
      const cleanText = stripAnsi(l.text).replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const hex = l.rawBytes ? bytesToHexString(l.rawBytes) : '';
      return [l.timestamp, date, `"${l.deviceName}"`, l.direction, l.level, `"${cleanText}"`, `"${hex}"`].join(',');
    });

    return {
      content: [headers.join(','), ...rows].join('\r\n'),
      filename: `firmware_debug_${timestampStr}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    };
  }

  if (options.format === 'json') {
    const report = {
      meta: {
        exportedAt: new Date().toISOString(),
        totalLogs: filtered.length,
        filterLevel: options.filterLevel || 'ALL',
        analytics: analytics || null,
      },
      logs: filtered.map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        time: new Date(l.timestamp).toISOString(),
        deviceId: l.deviceId,
        deviceName: l.deviceName,
        level: l.level,
        direction: l.direction,
        message: stripAnsi(l.text),
        hex: l.rawBytes ? bytesToHexString(l.rawBytes) : undefined,
      })),
    };

    return {
      content: JSON.stringify(report, null, 2),
      filename: `firmware_audit_${timestampStr}.json`,
      mimeType: 'application/json;charset=utf-8',
    };
  }

  if (options.format === 'hex') {
    const lines = filtered.map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString();
      const hex = l.rawBytes ? bytesToHexString(l.rawBytes) : '';
      const ascii = stripAnsi(l.text).replace(/[\r\n]+/g, '');
      return `[${time}] ${l.direction.padEnd(2)} | ${hex.padEnd(48)} | ${ascii}`;
    });

    return {
      content: lines.join('\r\n'),
      filename: `serial_hexdump_${timestampStr}.hex`,
      mimeType: 'text/plain;charset=utf-8',
    };
  }

  if (options.format === 'markdown') {
    const errorCount = filtered.filter(l => l.level === 'ERROR').length;
    const warnCount = filtered.filter(l => l.level === 'WARN').length;
    const totalBytes = filtered.reduce((acc, l) => acc + (l.rawBytes?.length || l.text.length), 0);

    const md = [
      `# Embedded Firmware Session Debug Report`,
      `**Generated:** ${new Date().toLocaleString()}  `,
      `**Total Log Entries:** ${filtered.length} | **Errors:** ${errorCount} | **Warnings:** ${warnCount}  `,
      `**Total Transferred Data:** ${(totalBytes / 1024).toFixed(2)} KB  `,
      ``,
      `---`,
      ``,
      `## Executive Telemetry Summary`,
      `| Metric | Value |`,
      `| :--- | :--- |`,
      `| Log Volume | ${filtered.length} entries |`,
      `| Critical Errors | ${errorCount} |`,
      `| Warnings | ${warnCount} |`,
      `| Error Rate | ${filtered.length > 0 ? ((errorCount / filtered.length) * 100).toFixed(2) : 0}% |`,
      `| Active Devices | ${Array.from(new Set(filtered.map(l => l.deviceName))).join(', ') || 'None'} |`,
      ``,
      `## Recent Critical Incidents (Last Errors/Warnings)`,
      `\`\`\``,
      ...filtered
        .filter(l => l.level === 'ERROR' || l.level === 'WARN')
        .slice(-15)
        .map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.deviceName}] ${l.level}: ${stripAnsi(l.text).trim()}`),
      `\`\`\``,
      ``,
      `## Full Chronological Log Stream`,
      `\`\`\``,
      ...filtered.slice(-100).map(l => {
        const time = options.includeTimestamps ? `[${new Date(l.timestamp).toLocaleTimeString()}] ` : '';
        return `${time}${l.direction === 'TX' ? '>> ' : '<< '}${stripAnsi(l.text).trim()}`;
      }),
      `\`\`\``,
      ``,
      `*Exported via WebSerial Embedded Debug Terminal*`,
    ].join('\n');

    return {
      content: md,
      filename: `firmware_incident_report_${timestampStr}.md`,
      mimeType: 'text/markdown;charset=utf-8',
    };
  }

  // Plain text .log format default
  const lines = filtered.map(l => {
    const time = options.includeTimestamps ? `[${new Date(l.timestamp).toLocaleTimeString()}] ` : '';
    const prefix = l.direction === 'TX' ? '[TX] ' : '[RX] ';
    return `${time}${prefix}${stripAnsi(l.text)}`;
  });

  return {
    content: lines.join(''),
    filename: `serial_stream_${timestampStr}.log`,
    mimeType: 'text/plain;charset=utf-8',
  };
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

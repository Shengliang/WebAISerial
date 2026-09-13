import React, { useState } from 'react';
import {
  BookOpen,
  Cable,
  Code2,
  FileCode2,
  HardDrive,
  Key,
  Layers,
  Server,
  Terminal,
  Wifi,
  X,
} from 'lucide-react';

interface ApiDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiDocumentationModal: React.FC<ApiDocumentationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    'webserial' | 'protocol' | 'scripting' | 'rest' | 'offline_crypto'
  >('webserial');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Hardware, API Integration & Offline Logging Documentation
              </h2>
              <p className="text-xs text-slate-400">
                Developer guides for WebSerial USB access, automation DSL, REST sync endpoints, and AES-GCM vault
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
            onClick={() => setActiveTab('webserial')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'webserial'
                ? 'bg-amber-950/60 text-amber-300 font-medium border border-amber-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cable className="w-3.5 h-3.5" />
            <span>WebSerial API & Hardware</span>
          </button>

          <button
            onClick={() => setActiveTab('protocol')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'protocol'
                ? 'bg-amber-950/60 text-amber-300 font-medium border border-amber-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>UART Framing & Reset Lines</span>
          </button>

          <button
            onClick={() => setActiveTab('scripting')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'scripting'
                ? 'bg-amber-950/60 text-amber-300 font-medium border border-amber-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Scripting Engine (DSL)</span>
          </button>

          <button
            onClick={() => setActiveTab('rest')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'rest'
                ? 'bg-amber-950/60 text-amber-300 font-medium border border-amber-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Cloud REST Sync API</span>
          </button>

          <button
            onClick={() => setActiveTab('offline_crypto')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              activeTab === 'offline_crypto'
                ? 'bg-amber-950/60 text-amber-300 font-medium border border-amber-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Encrypted Offline Vault</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs leading-relaxed space-y-4 font-sans">
          {activeTab === 'webserial' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <Cable className="w-4 h-4" />
                Connecting Physical Microcontrollers via WebSerial
              </h3>
              <p className="text-slate-300">
                The WebSerial API allows direct bidirectional serial communication between this web application and microcontrollers (ESP32, STM32, Arduino, Raspberry Pi Pico, Nordic nRF52) via USB-to-UART bridge ICs (CP2102, CH340, FT232, FT2232H).
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200">Browser Compatibility & Permissions:</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>Supported browsers: Google Chrome (89+), Microsoft Edge (89+), Opera.</li>
                  <li>Security Context: Must be served over HTTPS or localhost.</li>
                  <li>User Gesture Requirement: Port selection dialog requires a direct button click event.</li>
                  <li>Iframe Permissions: Requires <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded font-mono">allow="serial"</code> on iframe container if embedded.</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200">JavaScript Implementation Pattern:</h4>
                <pre className="bg-slate-900 p-3 rounded font-mono text-[11px] text-cyan-300 overflow-x-auto leading-5">
{`// 1. Request USB serial port from user
const port = await navigator.serial.requestPort({
  filters: [{ usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }]
});

// 2. Open port with baud rate & framing parameters
await port.open({
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none"
});

// 3. Pipe incoming byte stream to TextDecoder
const textDecoder = new TextDecoderStream();
const readableClosed = port.readable.pipeTo(textDecoder.writable);
const reader = textDecoder.readable.getReader();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log("RX:", value);
}`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'protocol' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4" />
                UART Protocol Framing & Hardware Control Signals
              </h3>
              <p className="text-slate-300">
                Embedded serial communications rely on precise line termination and hardware handshake lines:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <h4 className="font-semibold text-slate-200">Line Termination Modes</h4>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li><strong className="text-slate-200">CR+LF (\r\n):</strong> Standard for FreeRTOS, ESP-IDF, and AT command modems.</li>
                    <li><strong className="text-slate-200">LF (\n):</strong> Standard for Linux / Zephyr RTOS consoles.</li>
                    <li><strong className="text-slate-200">CR (\r):</strong> Classic VT100 / Mac serial interfaces.</li>
                    <li><strong className="text-slate-200">RAW / Binary:</strong> Transmits unmodified byte payloads without padding.</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <h4 className="font-semibold text-slate-200">ESP32 Auto-Reset Circuitry</h4>
                  <p className="text-slate-400">
                    ESP32 uses transistor cross-strapping between DTR and RTS lines to control EN (CHIP_PU) and GPIO0 (BOOT):
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-400 font-mono">
                    <li>Reset CPU: DTR=HIGH, RTS=LOW</li>
                    <li>Bootloader Mode: DTR=LOW, RTS=HIGH</li>
                    <li>Normal Running: DTR=LOW, RTS=LOW</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scripting' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4" />
                Automation Scripting Language Reference
              </h3>
              <p className="text-slate-300">
                Our custom script runner executes sequential firmware verification and regression tests without requiring Python or external terminal programs.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200">Supported Commands:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">SEND &lt;text&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Sends text command with newline.</p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">SEND_HEX &lt;hex bytes&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Injects raw binary hex frame.</p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">WAIT &lt;expected string&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Waits for target token in RX stream.</p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">SLEEP &lt;milliseconds&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Pauses execution thread.</p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">ASSERT &lt;condition&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Validates test pass criteria.</p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-cyan-400 font-bold">SIGNAL &lt;DTR|RTS&gt; &lt;HIGH|LOW&gt;</span>
                    <p className="text-slate-400 font-sans mt-0.5">Toggles hardware pin voltage.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rest' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <Server className="w-4 h-4" />
                Cloud Synchronization REST API Specification
              </h3>
              <p className="text-slate-300">
                Synchronizes multi-user test sessions, automated bug reports, and macro configurations across engineering benches:
              </p>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold">POST</span>
                    <span className="text-slate-200 font-bold">/api/sync</span>
                  </div>
                  <p className="font-sans text-slate-400 text-xs">
                    Uploads offline queued logs, script modifications, and session telemetry with conflict detection hash.
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold">GET</span>
                    <span className="text-slate-200 font-bold">/api/sessions/:id</span>
                  </div>
                  <p className="font-sans text-slate-400 text-xs">
                    Retrieves full telemetry history, baud settings, and error backtraces for a recorded bench session.
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 font-bold">POST</span>
                    <span className="text-slate-200 font-bold">/api/export</span>
                  </div>
                  <p className="font-sans text-slate-400 text-xs">
                    Archived long-term analytics logs into cloud storage buckets for historical regression tracking.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'offline_crypto' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4" />
                Encrypted Offline Data Logging Architecture
              </h3>
              <p className="text-slate-300">
                To guarantee engineers can debug devices in isolated cleanrooms, shielded RF test chambers, or remote field sites without connectivity, all logging runs in an offline-first architecture with end-to-end local encryption.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200">Security Architecture:</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li><strong className="text-slate-200">Cipher:</strong> AES-GCM 256-bit with unique 96-bit initialization vectors (IV) generated per snapshot.</li>
                  <li><strong className="text-slate-200">Key Derivation:</strong> PBKDF2 with HMAC-SHA-256 and 100,000 iterations from user passphrase.</li>
                  <li><strong className="text-slate-200">Storage Location:</strong> Encrypted client-side storage with automatic memory wiping upon vault lock.</li>
                  <li><strong className="text-slate-200">Zero Leakage:</strong> Unencrypted payloads never leave the browser sandbox.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

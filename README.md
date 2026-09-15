# Embedded Firmware Serial Console & Debugger

A high-performance web terminal, serial console, and ARM Cortex-M3 simulation environment designed for embedded firmware engineering, hardware debugging, automated boot captures, and team collaboration.

---

## Table of Contents

1. [Installing as a Desktop Application (PWA)](#1-installing-as-a-desktop-application-pwa)
   - [Google Chrome / Microsoft Edge / Chromium](#google-chrome--microsoft-edge--chromium)
   - [macOS Safari (macOS Sonoma+)](#macos-safari-macos-sonoma)
   - [Benefits of Desktop PWA Mode](#benefits-of-desktop-pwa-mode)
2. [Running Locally on Your Desktop](#2-running-locally-on-your-desktop)
   - [Prerequisites](#prerequisites)
   - [Installation & Setup](#installation--setup)
   - [Available Scripts](#available-scripts)
3. [Hardware & WebSerial Compatibility](#3-hardware--webserial-compatibility)
4. [Key Capabilities & Features](#4-key-capabilities--features)
   - [Serial Console & Hardware Control](#serial-console--hardware-control)
   - [ARM Cortex-M3 Core Simulator & Das U-Boot CLI](#arm-cortex-m3-core-simulator--das-u-boot-cli)
   - [Live Multi-User Collaboration](#live-multi-user-collaboration)
   - [Session Retention & Exporters](#session-retention--exporters)
5. [Remote API Access for External Machines & AI Agents (Linux Claude)](#5-remote-api-access-for-external-machines--ai-agents-linux-claude)
   - [Architecture & Workflow](#architecture--workflow)
   - [Reading Console Output in Real Time (SSE Stream)](#reading-console-output-in-real-time-sse-stream)
   - [Fetching Recent Logs via REST API](#fetching-recent-logs-via-rest-api)
   - [Sending Commands to Hardware from Linux](#sending-commands-to-hardware-from-linux)
   - [Python Client for Claude / Automation Scripts](#python-client-for-claude--automation-scripts)

---

## 1. Installing as a Desktop Application (PWA)

The application is built as a Progressive Web App (PWA). You can install it directly onto your desktop (Windows, macOS, or Linux) with a single click, allowing it to run as a standalone, windowed desktop software with native OS shortcuts, offline caching, and direct access to local USB serial ports.

### Google Chrome / Microsoft Edge / Chromium

1. Open the application in your Chromium-based browser (Google Chrome, Microsoft Edge, Brave, etc.).
2. Locate the **Install App** button in the top-right header toolbar of the console, or click the **Install** icon (a monitor with a down arrow) on the right side of the browser address bar (omnibox).
3. In the confirmation dialog that appears, click **Install**.
4. The application will immediately open in its own borderless desktop window with:
   - Dedicated taskbar / Dock icon.
   - Standalone window lifecycle independent of your browser tabs.
   - Desktop launcher shortcut in your system Start Menu (Windows), Applications / Launchpad (macOS), or Application Menu (Linux).

### macOS Safari (macOS Sonoma 14+)

1. Open the application URL in Safari.
2. Click **File** in the top macOS menu bar.
3. Select **Add to Dock...**.
4. Confirm the application title and click **Add**. The app will now launch directly from your macOS Dock as a standalone desktop utility.

### Benefits of Desktop PWA Mode

- **Clean Interface**: Eliminates browser navigation bars, tabs, and URL omniboxes for maximum terminal view space.
- **Hardware Integration**: Retains direct access to physical USB UART adapters (FTDI, CP2102, CH340, ESP32, STM32) via the W3C Web Serial API.
- **Offline Reliability**: Service Workers cache assets locally so you can boot the interface and simulator even without an active internet connection.
- **Dedicated Process**: Runs in an isolated operating system window, preventing accidental tab closure during long firmware flashes or boot monitoring sessions.

---

## 2. Running Locally on Your Desktop

To run the full-stack application on your local machine using Node.js:

### Prerequisites

- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm** or **bun** / **pnpm**
- **Chromium Browser**: Google Chrome, Microsoft Edge, or Opera (required for WebSerial hardware access)

### Installation & Setup

1. **Clone or download the project files** to your local drive:
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install all project dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   The local Express + Vite dev server will start and bind to `http://localhost:3000`.

4. **Open in browser**:
   Navigate to `http://localhost:3000` in Google Chrome or Microsoft Edge.

### Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Boots the development server with live TypeScript execution via `tsx` on port `3000`. |
| `npm run build` | Compiles the React client with Vite and bundles the Node.js backend to `dist/server.cjs` via `esbuild`. |
| `npm start` | Executes the production CommonJS server (`node dist/server.cjs`). |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) to validate syntax and types. |
| `npm run clean` | Cleans up the `dist/` build directory. |

---

## 3. Hardware & WebSerial Compatibility

When connecting to physical hardware bench devices:

- **Supported Browsers**: Google Chrome (89+), Microsoft Edge (89+), Opera, and Chromium-based derivatives.
- **Supported USB Adapters**:
  - FTDI (FT232R, FT2232H)
  - Silicon Labs CP2102 / CP2104
  - WCH CH340 / CH341
  - Prolific PL2303
  - Native USB CDC-ACM (STM32 VCP, ESP32-S2/S3 USB Serial/JTAG, Raspberry Pi Pico / RP2040)
- **Connecting a Device**:
  1. Plug your USB UART cable or development board into your computer.
  2. Click **Connect** in the device panel.
  3. In the browser's native serial device chooser prompt, select your COM / `/dev/ttyUSB*` / `/dev/cu.usbserial*` port and click **Connect**.
  4. Select your baud rate (from 300 up to 921,600 bps) and start transmitting and receiving serial data.
- **No Hardware Available?**: The console includes built-in virtual device profiles (ESP32-S3, STM32 Bootloader, Nordic BLE) and an ARM Cortex-M3 hardware simulator for offline testing.

---

## 4. Key Capabilities & Features

### Serial Console & Hardware Control
- **Hex Dump & ASCII View**: Dual-pane hex inspection and raw character streaming.
- **DTR / RTS Line Control**: Toggle hardware reset and bootloader trigger pins directly from the UI.
- **Configurable UART Parameters**: Baud rate, data bits, stop bits, parity, and flow control.
- **Command Macros & Quick Chips**: Save and trigger frequently used AT, shell, and boot commands.

### ARM Cortex-M3 Core Simulator & Das U-Boot CLI
- **Integrated C Compiler**: Compiles C code into Thumb-2 machine opcodes directly inside the browser.
- **Das U-Boot Command Shell**:
  - Memory Display & Modification: `md.l`, `md.b`, `mw.l`, `cp.l`, `cmp.l`.
  - RAM Diagnostics: `mtest` with walking 1s, checkerboard (`0x5555` / `0xAAAA`), and inverted address testing.
  - C Function Invocation: AAPCS-compliant function calls via `go <symbol|addr> [arg1] [arg2]` and `call <symbol> [args]`.
  - Thumb-2 Disassembly: `disasm <symbol|address> [count]` with opcode decoding.
  - Register File Inspector: `reg` dumps and edits R0–R12, SP, LR, PC, and xPSR flags.
  - Hardware Peripherals: Simulated GPIOC (PC13 active-low user LED), USART1, and real-time CPU cycle counter.

### Live Multi-User Collaboration
- **1-Writer / N-Readers Architecture**: Broadcast live serial streams from a physical test bench to remote team members over WebSockets.
- **Session Control**: Host assigns session ID and task tags; remote readers view live synchronized logs in real time.

### Session Retention & Exporters
- **IndexedDB 60-Month Archive**: Persists test session histories across browser restarts.
- **Multi-Format Export**: Export terminal logs to formatted text, raw hex, CSV, JSON, or SQLite database files.

---

## 5. Remote API Access for External Machines & AI Agents (Linux Claude)

The application includes built-in REST and Server-Sent Events (SSE) remote APIs with CORS enabled. This allows a setup where:
- The web app runs on your **MacBook** (or Windows PC) connected physically to the hardware board via USB WebSerial.
- An AI Agent (e.g., **Claude**, a Python automation script, or a CI/CD test runner) runs on a separate **Linux machine** (on the same local network, VPN, or public tunnel) and wants to:
  1. Read hardware console output in real time.
  2. Inspect recent boot logs and error traces.
  3. Send commands to the physical microcontroller.

```
+---------------------------+             HTTP / SSE / WebSocket            +---------------------------+
|  MacBook (Host / Writer)  | <-------------------------------------------> |  Linux Machine (Claude)   |
|                           |                                               |                           |
|  - WebApp (Port 3000)     |  GET  /api/logs/stream?format=text  (SSE)     |  - Claude AI Agent        |
|  - WebSerial Driver       |  GET  /api/logs?format=text&limit=100 (REST)  |  - Python test scripts    |
|  - USB-to-UART Bridge     |  POST /api/command                  (Control) |  - Terminal curl monitor  |
+-------------+-------------+                                               +---------------------------+
              | Physical USB
              v
   [ Microcontroller Board ]
   (ESP32 / STM32 / Pico)
```

### Architecture & Workflow

1. **Start the app on your MacBook**:
   ```bash
   npm run dev
   ```
   The backend server binds to `0.0.0.0:3000`.
2. **Find your MacBook's LAN IP**:
   Run `ipconfig getifaddr en0` (or check Network Settings in macOS). Example: `192.168.1.50`.
3. **Connect to hardware**: Open `http://localhost:3000` in Chrome on your MacBook and connect to your USB serial port.
4. **Access from Linux Claude**: On the Linux machine, Claude or your shell can directly communicate with `http://192.168.1.50:3000`.

---

### Reading Console Output in Real Time (SSE Stream)

To stream hardware logs continuously as they arrive from the UART port, connect to the Server-Sent Events endpoint (`/api/logs/stream`).

#### Plain Text Stream (Recommended for CLI & AI Agents):
```bash
curl -N http://<macbook-ip>:3000/api/logs/stream?format=text
```
*Output format:*
```text
[12:30:15.102] [RX] [BOOT] ESP-IDF v5.1-beta1 2nd stage bootloader
[12:30:15.110] [RX] [INIT] Loading flash partitions...
[12:30:15.220] [RX] [WIFI] Connecting to SSID: Lab-5G...
[12:30:15.450] [RX] [WIFI] Connected. IP: 192.168.1.120
```

#### Raw Output Stream (no timestamps/tags, identical to serial stream):
```bash
curl -N http://<macbook-ip>:3000/api/logs/stream?format=raw
```

#### JSON Stream with Recent History:
```bash
curl -N "http://<macbook-ip>:3000/api/logs/stream?format=json&history=50"
```

---

### Fetching Recent Logs via REST API

For point-in-time log snapshots, use `/api/logs`:

#### Fetch Last 50 Lines as Plain Text:
```bash
curl "http://<macbook-ip>:3000/api/logs?format=text&limit=50"
```

#### Fetch Structured JSON with Microcontroller Metadata:
```bash
curl "http://<macbook-ip>:3000/api/logs?limit=50"
```

*Response:*
```json
{
  "status": "ok",
  "count": 50,
  "sessionId": "BENCH-DEFAULT",
  "sessionName": "MacBook Bench Serial Console",
  "deviceInfo": {
    "name": "ESP32-S3 Bench #1",
    "baudRate": 115200,
    "status": "connected"
  },
  "hasActiveWriter": true,
  "logs": [
    {
      "id": "log-1715420101",
      "timestamp": 1715420101000,
      "deviceId": "dev-1",
      "type": "rx",
      "content": "System initialized successfully",
      "level": "info"
    }
  ]
}
```

---

### Sending Commands to Hardware from Linux

Claude running on Linux can inject commands directly into the physical microcontroller plugged into your MacBook using `POST /api/command`:

#### Send Text Command:
```bash
curl -X POST http://<macbook-ip>:3000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "help\n", "sender": "Linux Claude"}'
```

#### Send Binary Hex Bytes:
```bash
curl -X POST http://<macbook-ip>:3000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "AA 55 01 02 FF", "isHex": true, "sender": "Linux Claude"}'
```

When received by the MacBook, the command is immediately forwarded through WebSerial to the physical TX pin, and an echo entry tagged `[Remote: Linux Claude]` is displayed in the MacBook terminal.

---

### Python Client for Claude / Automation Scripts

Save this script as `remote_bench.py` on your Linux machine:

```python
import requests
import sys

HOST = "http://192.168.1.50:3000"  # Replace with your MacBook's IP address

def check_status():
    """Check connection state and active hardware device."""
    r = requests.get(f"{HOST}/api/status").json()
    print(f"Status: {r['status']}")
    if r.get('activeSession'):
        dev = r['activeSession'].get('deviceInfo', {})
        print(f"Device: {dev.get('name')} @ {dev.get('baudRate')} bps (Connected: {r['activeSession']['hasWriter']})")
    return r

def get_logs(limit=50):
    """Retrieve recent serial logs in plain text."""
    r = requests.get(f"{HOST}/api/logs", params={"format": "text", "limit": limit})
    return r.text

def stream_logs():
    """Stream live serial logs from the MacBook."""
    print("Connecting to live serial stream (Ctrl+C to stop)...")
    with requests.get(f"{HOST}/api/logs/stream?format=text", stream=True) as r:
        for line in r.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    print(decoded[6:])

def send_command(cmd: str):
    """Send a command to the physical serial port."""
    payload = {"command": cmd if cmd.endswith('\n') else cmd + '\n', "sender": "Claude (Linux)"}
    r = requests.post(f"{HOST}/api/command", json=payload).json()
    print(f"Dispatched: {r.get('message')}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "stream":
        stream_logs()
    elif len(sys.argv) > 1 and sys.argv[1] == "cmd":
        send_command(" ".join(sys.argv[2:]))
    else:
        check_status()
        print("\n--- Recent Logs ---")
        print(get_logs(20))
```

Usage from Linux:
```bash
# Check status and read last 20 logs:
python3 remote_bench.py

# Stream live serial output:
python3 remote_bench.py stream

# Send command to hardware:
python3 remote_bench.py cmd "reboot"
```


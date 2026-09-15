import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface SerialLogEntry {
  id: string;
  timestamp: number;
  deviceId: string;
  type: 'rx' | 'tx' | 'system' | 'error' | 'warning' | 'info';
  content: string;
  bytes?: number[];
  level: string;
}

interface Participant {
  id: string;
  name: string;
  role: 'writer' | 'reader';
  joinedAt: number;
  ip?: string;
}

interface LiveSessionRoom {
  sessionId: string;
  sessionName: string;
  taskId: string;
  createdAt: number;
  writerId: string | null;
  writerName: string;
  deviceInfo?: {
    name: string;
    baudRate: number;
    status: string;
    portName?: string;
  };
  recentLogs: SerialLogEntry[];
  participants: Map<string, Participant>;
}

interface SSEClient {
  id: string;
  res: express.Response;
  sessionId?: string;
  format: 'text' | 'json' | 'raw';
}

const rooms = new Map<string, LiveSessionRoom>();
const clientRooms = new Map<WebSocket, { sessionId: string; participantId: string }>();
const sseClients = new Set<SSEClient>();
let globalRecentLogs: SerialLogEntry[] = [];
let lastActiveDeviceInfo: Record<string, unknown> | null = null;

function appendGlobalLogs(logs: SerialLogEntry[]) {
  if (!logs || logs.length === 0) return;
  globalRecentLogs = [...globalRecentLogs, ...logs].slice(-3500);
}

function broadcastLogsToSSE(logs: SerialLogEntry[], sessionId?: string) {
  if (!logs || logs.length === 0 || sseClients.size === 0) return;
  for (const client of sseClients) {
    if (client.sessionId && sessionId && client.sessionId !== sessionId) {
      continue;
    }
    try {
      if (client.format === 'text') {
        for (const log of logs) {
          const time = new Date(log.timestamp).toISOString().substring(11, 23);
          client.res.write(`data: [${time}] [${(log.type || 'RX').toUpperCase()}] ${log.content}\n\n`);
        }
      } else if (client.format === 'raw') {
        for (const log of logs) {
          client.res.write(`data: ${log.content}\n\n`);
        }
      } else {
        client.res.write(`data: ${JSON.stringify({ logs })}\n\n`);
      }
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create HTTP & WebSocket Server early for route access
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Enable CORS for external automation & remote agents (Linux Claude, curl, scripts)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // SSE Keep-Alive Heartbeat
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(': keepalive\n\n');
      } catch {
        sseClients.delete(client);
      }
    }
  }, 15000);

  // REST API Endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      connectedClients: clientRooms.size,
      connectedSSEClients: sseClients.size,
      totalBufferedLogs: globalRecentLogs.length,
      timestamp: Date.now(),
    });
  });

  // GET /api/status - Remote API discovery, hardware state, and ready-to-run curl snippets
  app.get('/api/status', (req, res) => {
    const activeRoomsList = Array.from(rooms.values());
    const activeRoom = activeRoomsList.find(r => !!r.writerId) || activeRoomsList[0];
    const host = req.headers.host || `localhost:${PORT}`;
    const proto = req.secure ? 'https' : 'http';

    res.json({
      status: 'online',
      serverTime: new Date().toISOString(),
      timestamp: Date.now(),
      activeRooms: rooms.size,
      connectedWebSockets: clientRooms.size,
      connectedSSEClients: sseClients.size,
      totalBufferedLogs: globalRecentLogs.length,
      activeSession: activeRoom
        ? {
            sessionId: activeRoom.sessionId,
            sessionName: activeRoom.sessionName,
            writerName: activeRoom.writerName,
            hasWriter: !!activeRoom.writerId,
            deviceInfo: activeRoom.deviceInfo || lastActiveDeviceInfo,
            bufferedLogs: activeRoom.recentLogs.length,
          }
        : null,
      remoteApiExamples: {
        readLogsText: `curl ${proto}://${host}/api/logs?format=text`,
        readLogsJson: `curl ${proto}://${host}/api/logs?limit=50`,
        liveStreamSSE: `curl -N ${proto}://${host}/api/logs/stream?format=text`,
        sendCommand: `curl -X POST ${proto}://${host}/api/command -H "Content-Type: application/json" -d '{"command":"help\\n"}'`,
      },
    });
  });

  // List all active live sessions for easy team discovery
  app.get('/api/live-rooms', (req, res) => {
    const activeRooms = Array.from(rooms.values()).map(r => ({
      sessionId: r.sessionId,
      sessionName: r.sessionName,
      taskId: r.taskId,
      writerName: r.writerName,
      createdAt: r.createdAt,
      participantCount: r.participants.size,
      deviceInfo: r.deviceInfo,
      logCount: r.recentLogs.length,
      hasWriter: !!r.writerId,
    }));
    res.json({ rooms: activeRooms });
  });

  // Get specific session info
  app.get('/api/live-rooms/:sessionId', (req, res) => {
    const room = rooms.get(req.params.sessionId);
    if (!room) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({
      sessionId: room.sessionId,
      sessionName: room.sessionName,
      taskId: room.taskId,
      writerName: room.writerName,
      createdAt: room.createdAt,
      deviceInfo: room.deviceInfo,
      participants: Array.from(room.participants.values()),
      logCount: room.recentLogs.length,
      hasWriter: !!room.writerId,
    });
  });

  // GET /api/logs & /api/live-rooms/:sessionId/logs
  // Fetch console output remotely via REST (supports json, plain text, and raw)
  app.get(['/api/logs', '/api/live-rooms/:sessionId/logs'], (req, res) => {
    const reqSessionId =
      req.params.sessionId ||
      (req.query.sessionId as string) ||
      (req.query.session as string);
    const format = ((req.query.format as string) || 'json').toLowerCase();
    const limit = Math.min(
      Math.max(parseInt((req.query.limit as string) || '100', 10) || 100, 1),
      3000
    );
    const since = parseInt((req.query.since as string) || '0', 10) || 0;
    const filterType = (req.query.type as string)?.toLowerCase();

    let targetLogs: SerialLogEntry[] = [];
    let room = reqSessionId ? rooms.get(reqSessionId) : undefined;

    if (!room && !reqSessionId && rooms.size > 0) {
      const activeWithWriter = Array.from(rooms.values()).find(r => !!r.writerId);
      room = activeWithWriter || Array.from(rooms.values())[0];
    }

    if (room && room.recentLogs.length > 0) {
      targetLogs = room.recentLogs;
    } else if (globalRecentLogs.length > 0) {
      targetLogs = globalRecentLogs;
    } else if (room) {
      targetLogs = room.recentLogs;
    }

    if (since > 0) {
      targetLogs = targetLogs.filter(l => l.timestamp > since);
    }
    if (filterType) {
      targetLogs = targetLogs.filter(l => l.type.toLowerCase() === filterType);
    }

    const outputLogs = targetLogs.slice(-limit);

    if (format === 'text') {
      res.type('text/plain');
      const textLines = outputLogs
        .map(l => {
          const time = new Date(l.timestamp).toISOString().substring(11, 23);
          return `[${time}] [${(l.type || 'RX').toUpperCase()}] ${l.content}`;
        })
        .join('\n');
      res.send(textLines);
      return;
    }

    if (format === 'raw') {
      res.type('text/plain');
      const rawContent = outputLogs.map(l => l.content).join('\n');
      res.send(rawContent);
      return;
    }

    res.json({
      status: 'ok',
      count: outputLogs.length,
      sessionId: room?.sessionId || reqSessionId || 'global',
      sessionName: room?.sessionName || 'Global Console Buffer',
      deviceInfo: room?.deviceInfo || lastActiveDeviceInfo,
      hasActiveWriter: !!room?.writerId,
      logs: outputLogs,
    });
  });

  // GET /api/logs/stream & /api/live-rooms/:sessionId/stream (Server-Sent Events)
  // Stream live console output in real-time to remote Claude, curl, or scripts
  app.get(['/api/logs/stream', '/api/live-rooms/:sessionId/stream'], (req, res) => {
    const reqSessionId =
      req.params.sessionId ||
      (req.query.sessionId as string) ||
      (req.query.session as string);
    const format = ((req.query.format as string) || 'text').toLowerCase() as
      | 'text'
      | 'json'
      | 'raw';
    const historyCount = Math.min(
      Math.max(parseInt((req.query.history as string) || '20', 10) || 0, 0),
      200
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = 'sse_' + Math.random().toString(36).substring(2, 9);
    const client: SSEClient = {
      id: clientId,
      res,
      sessionId: reqSessionId,
      format: format === 'json' || format === 'raw' ? format : 'text',
    };
    sseClients.add(client);

    res.write(`: connected to serial console live stream (clientId=${clientId})\n\n`);

    // Send historical logs if requested
    if (historyCount > 0) {
      let historySource: SerialLogEntry[] = [];
      const room = reqSessionId ? rooms.get(reqSessionId) : undefined;
      if (room && room.recentLogs.length > 0) {
        historySource = room.recentLogs;
      } else {
        historySource = globalRecentLogs;
      }
      const pastLogs = historySource.slice(-historyCount);
      if (pastLogs.length > 0) {
        if (client.format === 'text') {
          for (const log of pastLogs) {
            const time = new Date(log.timestamp).toISOString().substring(11, 23);
            res.write(
              `data: [${time}] [${(log.type || 'RX').toUpperCase()}] ${log.content}\n\n`
            );
          }
        } else if (client.format === 'raw') {
          for (const log of pastLogs) {
            res.write(`data: ${log.content}\n\n`);
          }
        } else {
          res.write(`data: ${JSON.stringify({ logs: pastLogs, history: true })}\n\n`);
        }
      }
    }

    req.on('close', () => {
      sseClients.delete(client);
    });
  });

  // POST /api/command & /api/live-rooms/:sessionId/command
  // Allows remote Claude or automation scripts to send commands to the hardware serial port
  app.post(['/api/command', '/api/live-rooms/:sessionId/command'], (req, res) => {
    const { command, isHex, sender } = req.body;
    const reqSessionId = req.params.sessionId || req.body.sessionId;

    if (typeof command !== 'string' || command.length === 0) {
      res
        .status(400)
        .json({ error: 'Command string is required: { "command": "help\\n" }' });
      return;
    }

    let dispatchedCount = 0;
    const senderTag = sender || 'Remote Claude / Linux API';

    // Dispatch to active writer WS client
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        const clientInfo = clientRooms.get(client);
        if (clientInfo) {
          const room = rooms.get(clientInfo.sessionId);
          const matchesSession = !reqSessionId || clientInfo.sessionId === reqSessionId;
          const isWriter = room && room.writerId === clientInfo.participantId;
          if (matchesSession && isWriter) {
            client.send(
              JSON.stringify({
                type: 'remote_command_to_hardware',
                payload: {
                  command,
                  isHex: !!isHex,
                  sender: senderTag,
                  timestamp: Date.now(),
                },
              })
            );
            dispatchedCount++;
          }
        }
      }
    });

    // Fallback: if no writer matched specific session, broadcast to any writer
    if (dispatchedCount === 0 && !reqSessionId) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          const clientInfo = clientRooms.get(client);
          if (clientInfo) {
            const room = rooms.get(clientInfo.sessionId);
            if (room && room.writerId === clientInfo.participantId) {
              client.send(
                JSON.stringify({
                  type: 'remote_command_to_hardware',
                  payload: {
                    command,
                    isHex: !!isHex,
                    sender: senderTag,
                    timestamp: Date.now(),
                  },
                })
              );
              dispatchedCount++;
            }
          }
        }
      });
    }

    // Record the command as an outgoing event
    const cmdLog: SerialLogEntry = {
      id: 'api-cmd-' + Date.now(),
      timestamp: Date.now(),
      deviceId: 'remote-api',
      type: 'tx',
      content: `[${senderTag}] ${command.trim()}`,
      level: 'info',
    };

    appendGlobalLogs([cmdLog]);
    broadcastLogsToSSE([cmdLog], reqSessionId);

    res.json({
      status: 'ok',
      message:
        dispatchedCount > 0
          ? `Command successfully dispatched to hardware serial port via ${dispatchedCount} active writer client(s)`
          : 'Command logged and broadcasted. Note: No active hardware writer host is currently connected to execute this on physical serial.',
      command,
      isHex: !!isHex,
      dispatchedToWriters: dispatchedCount,
      timestamp: Date.now(),
    });
  });

  server.on('upgrade', (request, socket, head) => {
    // Ignore and close Vite HMR upgrade requests so they do not error in custom live console
    const secWebSocketProtocol = request.headers['sec-websocket-protocol'];
    if (typeof secWebSocketProtocol === 'string' && secWebSocketProtocol.includes('vite-hmr')) {
      socket.destroy();
      return;
    }

    const host = request.headers.host || 'localhost:3000';
    const url = new URL(request.url || '/', `http://${host}`);
    if (url.pathname === '/api/live-ws' || url.pathname === '/ws' || url.pathname === '/') {
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcastToRoom(
    sessionId: string,
    message: Record<string, unknown>,
    excludeWs?: WebSocket
  ) {
    const serialized = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
        const info = clientRooms.get(client);
        if (info && info.sessionId === sessionId) {
          client.send(serialized);
        }
      }
    });
  }

  wss.on('connection', (ws: WebSocket) => {
    const participantId = 'usr_' + Math.random().toString(36).substring(2, 9);

    ws.on('message', (raw: string) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, payload } = msg;

        switch (type) {
          case 'create_or_join_as_writer': {
            const { sessionId, sessionName, taskId, writerName, deviceInfo, initialLogs } =
              payload;

            let room = rooms.get(sessionId);
            if (!room) {
              room = {
                sessionId,
                sessionName: sessionName || `Debug Session ${sessionId}`,
                taskId: taskId || 'TASK-DEBUG-LIVE',
                createdAt: Date.now(),
                writerId: participantId,
                writerName: writerName || 'Engineer A',
                deviceInfo: deviceInfo || {
                  name: 'USB Serial Device',
                  baudRate: 115200,
                  status: 'connected',
                },
                recentLogs: Array.isArray(initialLogs) ? initialLogs.slice(-500) : [],
                participants: new Map(),
              };
              rooms.set(sessionId, room);
            } else {
              // Room exists: if no current writer or writer reconnecting
              room.writerId = participantId;
              room.writerName = writerName || room.writerName;
              if (deviceInfo) room.deviceInfo = deviceInfo;
            }

            if (deviceInfo) lastActiveDeviceInfo = deviceInfo;
            if (Array.isArray(initialLogs) && initialLogs.length > 0) {
              appendGlobalLogs(initialLogs);
            }

            const participant: Participant = {
              id: participantId,
              name: writerName || 'Engineer A (Host/Writer)',
              role: 'writer',
              joinedAt: Date.now(),
            };
            room.participants.set(participantId, participant);
            clientRooms.set(ws, { sessionId, participantId });

            // Confirm to writer
            ws.send(
              JSON.stringify({
                type: 'room_joined',
                payload: {
                  sessionId,
                  role: 'writer',
                  participantId,
                  room: {
                    sessionId: room.sessionId,
                    sessionName: room.sessionName,
                    taskId: room.taskId,
                    writerName: room.writerName,
                    deviceInfo: room.deviceInfo,
                    createdAt: room.createdAt,
                    recentLogs: room.recentLogs,
                    participants: Array.from(room.participants.values()),
                  },
                },
              })
            );

            // Broadcast to room
            broadcastToRoom(sessionId, {
              type: 'participant_joined',
              payload: {
                participant,
                participants: Array.from(room.participants.values()),
                hasWriter: true,
                writerName: room.writerName,
              },
            });
            break;
          }

          case 'join_room_as_reader': {
            const { sessionId, readerName } = payload;
            let room = rooms.get(sessionId);

            // If room doesn't exist yet, create a placeholder awaiting writer
            if (!room) {
              room = {
                sessionId,
                sessionName: `Debug Session ${sessionId}`,
                taskId: 'TASK-LIVE',
                createdAt: Date.now(),
                writerId: null,
                writerName: 'Awaiting Host...',
                deviceInfo: {
                  name: 'Serial Port (Offline)',
                  baudRate: 115200,
                  status: 'connecting',
                },
                recentLogs: [],
                participants: new Map(),
              };
              rooms.set(sessionId, room);
            }

            const participant: Participant = {
              id: participantId,
              name: readerName || `Reader ${room.participants.size + 1}`,
              role: 'reader',
              joinedAt: Date.now(),
            };
            room.participants.set(participantId, participant);
            clientRooms.set(ws, { sessionId, participantId });

            // Send initial state & full log history to reader
            ws.send(
              JSON.stringify({
                type: 'room_joined',
                payload: {
                  sessionId,
                  role: 'reader',
                  participantId,
                  room: {
                    sessionId: room.sessionId,
                    sessionName: room.sessionName,
                    taskId: room.taskId,
                    writerName: room.writerName,
                    deviceInfo: room.deviceInfo,
                    createdAt: room.createdAt,
                    recentLogs: room.recentLogs,
                    participants: Array.from(room.participants.values()),
                  },
                },
              })
            );

            // Notify others
            broadcastToRoom(
              sessionId,
              {
                type: 'participant_joined',
                payload: {
                  participant,
                  participants: Array.from(room.participants.values()),
                  hasWriter: !!room.writerId,
                  writerName: room.writerName,
                },
              },
              ws
            );
            break;
          }

          case 'stream_logs': {
            // ONLY ALLOW FROM CURRENT WRITER
            const clientInfo = clientRooms.get(ws);
            if (!clientInfo) return;

            const room = rooms.get(clientInfo.sessionId);
            if (!room || room.writerId !== clientInfo.participantId) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { message: 'Write permission denied: Only active Writer can stream serial logs.' },
                })
              );
              return;
            }

            const newLogs: SerialLogEntry[] = Array.isArray(payload.logs) ? payload.logs : [];
            if (newLogs.length > 0) {
              // Append to room buffer (keep last 2000 logs)
              room.recentLogs = [...room.recentLogs, ...newLogs].slice(-2000);
              appendGlobalLogs(newLogs);
              broadcastLogsToSSE(newLogs, room.sessionId);

              // Broadcast log batch to all readers
              broadcastToRoom(
                room.sessionId,
                {
                  type: 'logs_received',
                  payload: { logs: newLogs, totalBuffered: room.recentLogs.length },
                },
                ws
              );
            }
            break;
          }

          case 'writer_command_injected': {
            // Echo writer's TX command to readers so they see what Engineer A typed
            const clientInfo = clientRooms.get(ws);
            if (!clientInfo) return;
            const room = rooms.get(clientInfo.sessionId);
            if (!room || room.writerId !== clientInfo.participantId) return;

            broadcastToRoom(
              room.sessionId,
              {
                type: 'writer_command_injected',
                payload: {
                  command: payload.command,
                  isHex: payload.isHex,
                  timestamp: Date.now(),
                  writerName: room.writerName,
                },
              },
              ws
            );
            break;
          }

          case 'update_device_state': {
            const clientInfo = clientRooms.get(ws);
            if (!clientInfo) return;
            const room = rooms.get(clientInfo.sessionId);
            if (!room || room.writerId !== clientInfo.participantId) return;

            if (payload.deviceInfo) {
              room.deviceInfo = { ...room.deviceInfo, ...payload.deviceInfo };
              lastActiveDeviceInfo = room.deviceInfo;
            }
            if (payload.taskId) room.taskId = payload.taskId;
            if (payload.sessionName) room.sessionName = payload.sessionName;

            broadcastToRoom(
              room.sessionId,
              {
                type: 'device_state_updated',
                payload: {
                  deviceInfo: room.deviceInfo,
                  taskId: room.taskId,
                  sessionName: room.sessionName,
                },
              },
              ws
            );
            break;
          }

          case 'request_clear_logs': {
            const clientInfo = clientRooms.get(ws);
            if (!clientInfo) return;
            const room = rooms.get(clientInfo.sessionId);
            if (!room || room.writerId !== clientInfo.participantId) return;

            room.recentLogs = [];
            broadcastToRoom(room.sessionId, {
              type: 'logs_cleared',
              payload: { clearedBy: room.writerName, timestamp: Date.now() },
            });
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      const info = clientRooms.get(ws);
      if (info) {
        const { sessionId, participantId } = info;
        clientRooms.delete(ws);

        const room = rooms.get(sessionId);
        if (room) {
          const leavingParticipant = room.participants.get(participantId);
          room.participants.delete(participantId);

          const wasWriter = room.writerId === participantId;
          if (wasWriter) {
            room.writerId = null;
          }

          // Broadcast departure
          broadcastToRoom(sessionId, {
            type: 'participant_left',
            payload: {
              participantId,
              participantName: leavingParticipant?.name || 'Participant',
              wasWriter,
              participants: Array.from(room.participants.values()),
              hasWriter: !!room.writerId,
            },
          });

          // Clean up room after 10 minutes if no participants remain
          if (room.participants.size === 0) {
            setTimeout(() => {
              const checkRoom = rooms.get(sessionId);
              if (checkRoom && checkRoom.participants.size === 0) {
                rooms.delete(sessionId);
                console.log(`Cleaned up empty live session room: ${sessionId}`);
              }
            }, 600000);
          }
        }
      }
    });
  });

  // Vite Middleware in Development vs Static in Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Embedded Serial Console Live Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

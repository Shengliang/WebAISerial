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

const rooms = new Map<string, LiveSessionRoom>();
const clientRooms = new Map<WebSocket, { sessionId: string; participantId: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // REST API Endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      connectedClients: clientRooms.size,
      timestamp: Date.now(),
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

  // Create HTTP & WebSocket Server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

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
              // Append to room buffer (keep last 1500 logs)
              room.recentLogs = [...room.recentLogs, ...newLogs].slice(-1500);

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

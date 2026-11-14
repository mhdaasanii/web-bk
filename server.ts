import express from 'express';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();
const PORT = Number(process.env.PORT || 3000);
const VIDEO_ROOM_SECRET =
  process.env.VIDEO_ROOM_SECRET || crypto.randomBytes(32).toString('hex');

interface VideoTokenPayload {
  roomId: string;
  scheduleId: string;
  uid: string;
  role: 'student' | 'counselor';
  displayName: string;
  exp: number;
}

function signVideoToken(payload: VideoTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', VIDEO_ROOM_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyVideoToken(token: string): VideoTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', VIDEO_ROOM_SECRET)
    .update(encoded)
    .digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as VideoTokenPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseFirestoreField(field: Record<string, any> | undefined): any {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return Boolean(field.booleanValue);
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
  return undefined;
}

function parseFirestoreDoc(docJson: any): Record<string, any> | null {
  if (!docJson || !docJson.fields) return null;
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(docJson.fields)) {
    result[key] = parseFirestoreField(val as Record<string, any>);
  }
  return result;
}

function getIceServers() {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  return iceServers;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Ruang Tumbuh Counseling Server' });
  });

  // Mint short-lived, schedule-verified WebRTC room access token
  app.post('/api/video/token', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autentikasi diperlukan untuk mengakses ruang konseling.' });
    }

    const idToken = authHeader.slice('Bearer '.length);
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Sesi autentikasi tidak valid atau telah berakhir.' });
    }

    const { scheduleId } = req.body as { scheduleId?: string };
    if (!scheduleId || !/^[a-zA-Z0-9_-]{1,128}$/.test(scheduleId)) {
      return res.status(400).json({ error: 'ID jadwal tidak valid.' });
    }

    // Fetch schedule document directly via Firestore REST API using the caller's own ID token
    // so Firestore Security Rules remain enforced on the backend request.
    const docUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/counselingSchedules/${scheduleId}`;
    let schedule: Record<string, any> | null = null;
    try {
      const resp = await fetch(docUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (resp.status === 403 || resp.status === 404) {
        return res.status(403).json({
          error: 'Akses ditolak. Hanya mahasiswa dan konselor yang terjadwal yang dapat memasuki ruang ini.',
        });
      }
      if (!resp.ok) {
        return res.status(502).json({ error: 'Gagal memverifikasi jadwal konseling dari server.' });
      }
      const json = await resp.json();
      schedule = parseFirestoreDoc(json);
    } catch (err) {
      console.error('Error fetching schedule from Firestore REST:', err);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memverifikasi jadwal.' });
    }

    if (!schedule) {
      return res.status(404).json({ error: 'Jadwal konseling tidak ditemukan.' });
    }

    if (schedule.method !== 'online') {
      return res.status(400).json({ error: 'Jadwal ini merupakan sesi konseling tatap muka (offline).' });
    }

    if (schedule.status !== 'confirmed' && schedule.status !== 'in_progress') {
      return res.status(403).json({
        error: `Ruang konseling tidak tersedia karena status jadwal saat ini: ${schedule.status}.`,
      });
    }

    // Strict participant verification: Admin cannot join private counseling rooms!
    let participantRole: 'student' | 'counselor' | null = null;
    let displayName = decoded.name || decoded.email || 'Peserta';
    let peerName = '';
    if (decoded.uid === schedule.studentUid) {
      participantRole = 'student';
      displayName = schedule.studentName || displayName;
      peerName = schedule.counselorName || 'Konselor Lab BK';
    } else if (decoded.uid === schedule.counselorUid) {
      participantRole = 'counselor';
      displayName = schedule.counselorName || displayName;
      peerName = schedule.studentName || 'Mahasiswa';
    }

    if (!participantRole) {
      return res.status(403).json({
        error: 'Akses ditolak. Ruang konseling bersifat rahasia dan hanya untuk mahasiswa serta konselor yang ditugaskan.',
      });
    }

    // Validate time window in WIB (Asia/Jakarta, UTC+7)
    const startIso = `${schedule.date}T${schedule.startTime}:00+07:00`;
    const endIso = `${schedule.date}T${schedule.endTime}:00+07:00`;
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    const nowMs = Date.now();

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
      const windowBeforeMs = 15 * 60 * 1000; // 15 minutes before start
      const windowAfterMs = 60 * 60 * 1000; // 60 minutes grace after scheduled end
      if (nowMs < startMs - windowBeforeMs) {
        return res.status(403).json({
          error: `Ruang video call belum dibuka. Anda dapat bergabung mulai 15 menit sebelum jadwal (${schedule.date} pukul ${schedule.startTime} WIB).`,
        });
      }
      if (nowMs > endMs + windowAfterMs) {
        return res.status(403).json({
          error: 'Masa berlaku ruang konseling untuk jadwal ini telah berakhir.',
        });
      }
    }

    const roomId = schedule.videoRoomId || `room-${scheduleId}`;
    const exp = Number.isNaN(endMs) ? nowMs + 2 * 60 * 60 * 1000 : endMs + 90 * 60 * 1000;

    const roomToken = signVideoToken({
      roomId,
      scheduleId,
      uid: decoded.uid,
      role: participantRole,
      displayName,
      exp,
    });

    return res.json({
      roomToken,
      roomId,
      scheduleId,
      participantRole,
      participantName: displayName,
      peerName,
      expiresAt: new Date(exp).toISOString(),
      iceServers: getIceServers(),
    });
  });

  const httpServer = http.createServer(app);

  // WebSocket Signaling Server on /ws
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface RoomParticipant {
    ws: WebSocket;
    uid: string;
    role: 'student' | 'counselor';
    displayName: string;
    mediaState: { audio: boolean; video: boolean };
  }

  const rooms = new Map<string, Map<string, RoomParticipant>>();
  const notificationSockets = new Map<string, Set<WebSocket>>();

  function broadcastToRoom(roomId: string, senderUid: string | null, message: object) {
    const room = rooms.get(roomId);
    if (!room) return;
    const raw = JSON.stringify(message);
    for (const [uid, participant] of room.entries()) {
      if (uid !== senderUid && participant.ws.readyState === WebSocket.OPEN) {
        participant.ws.send(raw);
      }
    }
  }

  wss.on('connection', (ws) => {
    let joinedRoomId: string | null = null;
    let joinedUid: string | null = null;
    let notifUid: string | null = null;

    ws.on('message', async (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }

      // General notification subscription channel
      if (msg.type === 'notif:subscribe' && typeof msg.idToken === 'string') {
        try {
          const decoded = await adminAuth.verifyIdToken(msg.idToken);
          notifUid = decoded.uid;
          if (!notificationSockets.has(notifUid)) {
            notificationSockets.set(notifUid, new Set());
          }
          notificationSockets.get(notifUid)!.add(ws);
          ws.send(JSON.stringify({ type: 'notif:subscribed', uid: notifUid }));
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
        }
        return;
      }

      // Join WebRTC Video Room
      if (msg.type === 'join' && typeof msg.roomToken === 'string') {
        const verified = verifyVideoToken(msg.roomToken);
        if (!verified) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Token ruang tidak valid atau kedaluwarsa.' }));
          ws.close(4001, 'Invalid room token');
          return;
        }

        const { roomId, uid, role, displayName } = verified;
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Map());
        }
        const room = rooms.get(roomId)!;

        // Replace stale socket if same user reconnects
        const existing = room.get(uid);
        if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
          existing.ws.close(4002, 'Reconnected from another tab');
        }

        // Enforce strictly max 2 distinct participants
        if (!room.has(uid) && room.size >= 2) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Ruang konseling sudah penuh (maksimal 2 peserta).' }));
          ws.close(4003, 'Room full');
          return;
        }

        const mediaState = msg.mediaState || { audio: true, video: true };
        const participant: RoomParticipant = { ws, uid, role, displayName, mediaState };
        room.set(uid, participant);
        joinedRoomId = roomId;
        joinedUid = uid;

        const peers = Array.from(room.values())
          .filter((p) => p.uid !== uid)
          .map((p) => ({ uid: p.uid, role: p.role, displayName: p.displayName, mediaState: p.mediaState }));

        ws.send(
          JSON.stringify({
            type: 'room:joined',
            roomId,
            self: { uid, role, displayName },
            peers,
          })
        );

        broadcastToRoom(roomId, uid, {
          type: 'peer:joined',
          peer: { uid, role, displayName, mediaState },
        });
        return;
      }

      // Relay WebRTC signaling & session events only within authenticated room
      if (!joinedRoomId || !joinedUid) return;

      if (
        msg.type === 'webrtc:offer' ||
        msg.type === 'webrtc:answer' ||
        msg.type === 'webrtc:ice-candidate' ||
        msg.type === 'media:state' ||
        msg.type === 'session:ended'
      ) {
        broadcastToRoom(joinedRoomId, joinedUid, {
          ...msg,
          fromUid: joinedUid,
        });
      }
    });

    ws.on('close', () => {
      if (joinedRoomId && joinedUid) {
        const room = rooms.get(joinedRoomId);
        if (room) {
          const current = room.get(joinedUid);
          if (current && current.ws === ws) {
            room.delete(joinedUid);
            broadcastToRoom(joinedRoomId, joinedUid, {
              type: 'peer:left',
              uid: joinedUid,
            });
          }
          if (room.size === 0) {
            rooms.delete(joinedRoomId);
          }
        }
      }
      if (notifUid && notificationSockets.has(notifUid)) {
        const set = notificationSockets.get(notifUid)!;
        set.delete(ws);
        if (set.size === 0) notificationSockets.delete(notifUid);
      }
    });
  });

  // Endpoint to notify connected target user immediately over WS
  app.post('/api/notifications/push', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      await adminAuth.verifyIdToken(authHeader.slice('Bearer '.length));
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const { targetUid, title, message } = req.body as {
      targetUid?: string;
      title?: string;
      message?: string;
    };
    if (targetUid && notificationSockets.has(targetUid)) {
      const payload = JSON.stringify({ type: 'notification:new', title, message });
      for (const sock of notificationSockets.get(targetUid)!) {
        if (sock.readyState === WebSocket.OPEN) sock.send(payload);
      }
    }
    return res.json({ pushed: true });
  });

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Ruang Tumbuh server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

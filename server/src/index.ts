import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import routes from './routes/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: isProduction ? false : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Socket.io — room-based viewer state sync
// Path is mounted under /modeling/ so the reverse proxy forwards it correctly
const io = new Server(httpServer, {
  path: '/modeling/socket.io/',
  cors: {
    origin: isProduction ? false : 'http://localhost:5173',
    credentials: true
  }
});

// Per-socket throttle state for viewer-state relay.
// During fast dragging the sender emits every 100ms; we relay immediately on the leading
// edge and always relay the trailing state at the end of each 80ms window so receivers
// see smooth updates without being flooded by every intermediate frame.
interface PendingState { groupId: string; state: string; relayScheduled: boolean; timer: ReturnType<typeof setTimeout> }
const pendingStates = new Map<string, PendingState>();

io.on('connection', (socket) => {
  socket.on('join-group', (groupId: string) => {
    socket.join(`group:${groupId}`);
    // Tell existing room members a new peer has joined so they can re-broadcast
    // their current state, giving the newcomer an up-to-date view immediately.
    socket.to(`group:${groupId}`).emit('peer-joined');
    // Broadcast updated room size to everyone (including the new joiner).
    const count = io.sockets.adapter.rooms.get(`group:${groupId}`)?.size ?? 1;
    io.to(`group:${groupId}`).emit('peer-count', count);
  });

  socket.on('viewer-state', ({ groupId, state }: { groupId: string; state: string }) => {
    const existing = pendingStates.get(socket.id);
    if (existing) {
      // Within the current throttle window: store the latest state but don't relay yet.
      // The trailing relay at window-end will send this newest state.
      existing.state = state;
      existing.groupId = groupId;
      existing.relayScheduled = true;
    } else {
      // Leading edge: relay immediately so the first frame of a drag arrives instantly.
      socket.to(`group:${groupId}`).emit('viewer-state', state);
      const entry: PendingState = { groupId, state, relayScheduled: false, timer: null! };
      entry.timer = setTimeout(() => {
        pendingStates.delete(socket.id);
        // Trailing edge: relay the latest state accumulated during this window.
        if (entry.relayScheduled) {
          socket.to(entry.groupId).emit('viewer-state', entry.state);
        }
      }, 80);
      pendingStates.set(socket.id, entry);
    }
  });

  socket.on('leave-group', (groupId: string) => {
    socket.leave(`group:${groupId}`);
    const count = io.sockets.adapter.rooms.get(`group:${groupId}`)?.size ?? 0;
    io.to(`group:${groupId}`).emit('peer-count', count);
  });

  // Use 'disconnecting' (not 'disconnect') so socket.rooms is still populated.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id && room.startsWith('group:')) {
        const currentSize = io.sockets.adapter.rooms.get(room)?.size ?? 1;
        socket.to(room).emit('peer-count', currentSize - 1);
      }
    }
  });

  socket.on('disconnect', () => {
    const pending = pendingStates.get(socket.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingStates.delete(socket.id);
    }
  });
});

// API Routes - mounted at /modeling/api for subdirectory deployment
app.use('/modeling/api', routes);

// Health check
app.get('/modeling/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (isProduction) {
  const publicPath = path.join(__dirname, '..', 'public');

  // Serve static assets under /modeling path
  app.use('/modeling', express.static(publicPath));

  // Handle SPA routing - serve index.html for all /modeling routes that aren't API
  app.get('/modeling/*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // Redirect root /modeling to /modeling/ for consistency
  app.get('/modeling', (req, res) => {
    res.redirect('/modeling/');
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('Serving frontend from public folder');
  }
});

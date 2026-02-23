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

io.on('connection', (socket) => {
  socket.on('join-group', (groupId: string) => {
    socket.join(`group:${groupId}`);
  });

  socket.on('viewer-state', ({ groupId, state }: { groupId: string; state: string }) => {
    // Broadcast to all OTHER sockets in the room (not the sender)
    socket.to(`group:${groupId}`).emit('viewer-state', state);
  });

  socket.on('leave-group', (groupId: string) => {
    socket.leave(`group:${groupId}`);
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

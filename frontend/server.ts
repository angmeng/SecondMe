/**
 * Custom Next.js Server with Socket.io Integration
 * Required for real-time features (QR code streaming, status updates)
 */

import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

async function startServer() {
  try {
    await app.prepare();

    const httpServer = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        console.error('Error handling request:', err);
        res.statusCode = 500;
        res.end('Internal server error');
      }
    });

    // Initialize Socket.io
    const io = new Server(httpServer, {
      cors: {
        origin:
          process.env.CORS_ORIGIN || dev
            ? ['http://localhost:3000', 'http://localhost:3001']
            : false,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Socket.io connection handler
    io.on('connection', (socket) => {
      console.log(`[Frontend Server] Client connected: ${socket.id}`);

      // Join rooms for targeted updates
      socket.on('join_room', (room: string) => {
        socket.join(room);
        console.log(`[Frontend Server] Client ${socket.id} joined room: ${room}`);
      });

      socket.on('leave_room', (room: string) => {
        socket.leave(room);
        console.log(`[Frontend Server] Client ${socket.id} left room: ${room}`);
      });

      socket.on('disconnect', (reason) => {
        console.log(`[Frontend Server] Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      // Heartbeat for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });

    // Start HTTP server
    httpServer.listen(port, () => {
      console.log(`[Frontend Server] Ready on http://${hostname}:${port}`);
      console.log(`[Frontend Server] Socket.io enabled for real-time updates`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('[Frontend Server] Shutting down gracefully...');
      io.close(() => {
        console.log('[Frontend Server] Socket.io closed');
        httpServer.close(() => {
          console.log('[Frontend Server] HTTP server closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[Frontend Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

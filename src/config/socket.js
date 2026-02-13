// src/config/socket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const socketService = require('../services/socketService');

let io;

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Middleware d'authentification Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                    socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Token manquant'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user) {
        return next(new Error('Authentication error: Utilisateur non trouvé'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Token invalide'));
    }
  });

  // Gestion des connexions
  io.on('connection', async (socket) => {
    console.log(`✅ User connected: ${socket.userId}`);

    // Marquer l'utilisateur comme en ligne
    await User.findByIdAndUpdate(socket.userId, {
      isOnline: true,
      socketId: socket.id,
      lastSeen: new Date()
    });

    // Rejoindre les rooms des conversations
    await socketService.joinUserRooms(socket);

    // Notifier les contacts que l'utilisateur est en ligne
    socket.broadcast.emit('user:online', {
      userId: socket.userId,
      timestamp: new Date()
    });

    // Gestion des événements de messages
    socket.on('message:send', (data) => socketService.handleSendMessage(socket, data));
    socket.on('message:read', (data) => socketService.handleMessageRead(socket, data));
    socket.on('message:delivered', (data) => socketService.handleMessageDelivered(socket, data));
    
    // Gestion du typing
    socket.on('typing:start', (data) => socketService.handleTypingStart(socket, data));
    socket.on('typing:stop', (data) => socketService.handleTypingStop(socket, data));
    
    // Édition et suppression
    socket.on('message:edit', (data) => socketService.handleMessageEdit(socket, data));
    socket.on('message:delete', (data) => socketService.handleMessageDelete(socket, data));

    // Gestion des conversations
    socket.on('conversation:join', (data) => socketService.handleConversationJoin(socket, data));
    socket.on('conversation:leave', (data) => socketService.handleConversationLeave(socket, data));

    // Déconnexion
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
      
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date(),
        socketId: null
      });

      socket.broadcast.emit('user:offline', {
        userId: socket.userId,
        lastSeen: new Date()
      });
    });

    // Gestion des erreurs
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO non initialisé');
  }
  return io;
};

module.exports = { initSocket, getIO };
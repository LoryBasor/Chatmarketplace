// src/services/socketService.js
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getIO } = require('../config/socket');

// Rejoindre les rooms des conversations de l'utilisateur
exports.joinUserRooms = async (socket) => {
  try {
    const conversations = await Conversation.find({
      participants: socket.userId
    });

    conversations.forEach(conv => {
      socket.join(`conversation:${conv._id}`);
    });

    console.log(`User ${socket.userId} joined ${conversations.length} rooms`);
  } catch (error) {
    console.error('Error joining rooms:', error);
  }
};

// Gérer l'envoi de message via Socket
exports.handleSendMessage = async (socket, data) => {
  try {
    const { conversationId, content, type = 'text', replyTo } = data;

    // Vérifier l'accès à la conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: socket.userId
    });

    if (!conversation) {
      return socket.emit('error', { message: 'Conversation non trouvée' });
    }

    // Créer le message
    const message = await Message.create({
      conversation: conversationId,
      sender: socket.userId,
      content,
      type,
      replyTo
    });

    await message.populate('sender', '-password');
    if (replyTo) await message.populate('replyTo');

    // Mettre à jour la conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;

    // Incrémenter les non lus
    for (const participantId of conversation.participants) {
      if (participantId.toString() !== socket.userId.toString()) {
        await conversation.incrementUnread(participantId);
      }
    }

    await conversation.save();

    // Émettre le message à tous dans la conversation
    const io = getIO();
    io.to(`conversation:${conversationId}`).emit('message:new', message);

    // Envoyer confirmation à l'émetteur
    socket.emit('message:sent', { tempId: data.tempId, message });

  } catch (error) {
    console.error('Error sending message:', error);
    socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
  }
};

// Marquer un message comme livré
exports.handleMessageDelivered = async (socket, data) => {
  try {
    const { messageId } = data;

    const message = await Message.findById(messageId);
    if (!message) return;

    await message.markAsDelivered(socket.userId);

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:delivered', {
      messageId,
      userId: socket.userId,
      deliveredAt: new Date()
    });

  } catch (error) {
    console.error('Error marking as delivered:', error);
  }
};

// Marquer un message comme lu
exports.handleMessageRead = async (socket, data) => {
  try {
    const { messageId, conversationId } = data;

    if (messageId) {
      // Marquer un message spécifique
      const message = await Message.findById(messageId);
      if (message) {
        await message.markAsRead(socket.userId);
        
        const io = getIO();
        io.to(`conversation:${message.conversation}`).emit('message:read', {
          messageId,
          userId: socket.userId,
          readAt: new Date()
        });
      }
    } else if (conversationId) {
      // Marquer tous les messages de la conversation
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        await conversation.resetUnread(socket.userId);

        await Message.updateMany(
          {
            conversation: conversationId,
            sender: { $ne: socket.userId },
            'readBy.user': { $ne: socket.userId }
          },
          {
            $push: { readBy: { user: socket.userId, readAt: new Date() } },
            'status.read': true
          }
        );

        const io = getIO();
        io.to(`conversation:${conversationId}`).emit('messages:read', {
          conversationId,
          userId: socket.userId,
          readAt: new Date()
        });
      }
    }

  } catch (error) {
    console.error('Error marking as read:', error);
  }
};

// Gérer l'indicateur "en train d'écrire"
exports.handleTypingStart = async (socket, data) => {
  try {
    const { conversationId } = data;
    
    socket.to(`conversation:${conversationId}`).emit('typing:user', {
      userId: socket.userId,
      conversationId,
      isTyping: true
    });
  } catch (error) {
    console.error('Error handling typing start:', error);
  }
};

exports.handleTypingStop = async (socket, data) => {
  try {
    const { conversationId } = data;
    
    socket.to(`conversation:${conversationId}`).emit('typing:user', {
      userId: socket.userId,
      conversationId,
      isTyping: false
    });
  } catch (error) {
    console.error('Error handling typing stop:', error);
  }
};

// Éditer un message
exports.handleMessageEdit = async (socket, data) => {
  try {
    const { messageId, content } = data;

    const message = await Message.findOne({
      _id: messageId,
      sender: socket.userId
    });

    if (!message) {
      return socket.emit('error', { message: 'Message non trouvé' });
    }

    await message.edit(content);
    await message.populate('sender', '-password');

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:edited', message);

  } catch (error) {
    console.error('Error editing message:', error);
    socket.emit('error', { message: 'Erreur lors de l\'édition' });
  }
};

// Supprimer un message
exports.handleMessageDelete = async (socket, data) => {
  try {
    const { messageId, forEveryone = false } = data;

    const message = await Message.findById(messageId);

    if (!message) {
      return socket.emit('error', { message: 'Message non trouvé' });
    }

    if (forEveryone && message.sender.toString() !== socket.userId.toString()) {
      return socket.emit('error', { message: 'Non autorisé' });
    }

    await message.softDelete(socket.userId, forEveryone);

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:deleted', {
      messageId,
      forEveryone,
      deletedBy: socket.userId
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    socket.emit('error', { message: 'Erreur lors de la suppression' });
  }
};

// Rejoindre une conversation
exports.handleConversationJoin = async (socket, data) => {
  try {
    const { conversationId } = data;
    socket.join(`conversation:${conversationId}`);
    console.log(`User ${socket.userId} joined conversation ${conversationId}`);
  } catch (error) {
    console.error('Error joining conversation:', error);
  }
};

// Quitter une conversation
exports.handleConversationLeave = async (socket, data) => {
  try {
    const { conversationId } = data;
    socket.leave(`conversation:${conversationId}`);
    console.log(`User ${socket.userId} left conversation ${conversationId}`);
  } catch (error) {
    console.error('Error leaving conversation:', error);
  }
};

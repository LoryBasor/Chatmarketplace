// src/services/socketService.js
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');

// Lazy-require pour briser la dépendance circulaire socket.js <-> socketService.js
const getIO = () => require('../config/socket').getIO();

// Helper : comparer deux IDs (Number ou String)
const sameId = (a, b) => String(a) === String(b);

// Rejoindre les rooms des conversations de l'utilisateur
exports.joinUserRooms = async (socket) => {
  try {
    const conversations = await Conversation.findByUser(socket.userId);
    conversations.forEach(conv => {
      socket.join(`conversation:${conv.id}`);
    });
    console.log(`User ${socket.userId} joined ${conversations.length} rooms`);
  } catch (error) {
    console.error('Error joining rooms:', error);
  }
};

// Envoyer un message via Socket
exports.handleSendMessage = async (socket, data) => {
  try {
    const { conversationId, content, type = 'text', replyTo } = data;
    const convId = parseInt(conversationId);

    const conversation = await Conversation.findOne({ id: convId, participant: socket.userId });
    if (!conversation) {
      return socket.emit('error', { message: 'Conversation non trouvée' });
    }

    const message = await Message.create({
      conversation: convId,
      sender:       socket.userId,
      content,
      type,
      replyTo: replyTo ? parseInt(replyTo) : null
    });

    // Mettre à jour la conversation
    await Conversation.updateLastMessage(convId, message.id, message.createdAt);

    // Incrémenter non-lus pour les autres
    for (const participant of conversation.participants) {
      if (!sameId(participant.id, socket.userId)) {
        await Conversation.incrementUnread(convId, participant.id);
      }
    }

    // Émettre à toute la room SAUF l'émetteur
    socket.to(`conversation:${convId}`).emit('message:new', message);

    // Confirmation à l'émetteur
    socket.emit('message:sent', { tempId: data.tempId, message });

  } catch (error) {
    console.error('Error sending message:', error);
    socket.emit('error', { message: "Erreur lors de l'envoi du message" });
  }
};

// Marquer comme livré
exports.handleMessageDelivered = async (socket, data) => {
  try {
    const { messageId } = data;
    const msgId = parseInt(messageId);

    const message = await Message.findById(msgId);
    if (!message) return;

    await Message.markAsDelivered(msgId, socket.userId);

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:delivered', {
      messageId: msgId,
      userId: socket.userId,
      deliveredAt: new Date()
    });
  } catch (error) {
    console.error('Error marking as delivered:', error);
  }
};

// Marquer comme lu
exports.handleMessageRead = async (socket, data) => {
  try {
    const { messageId, conversationId } = data;

    if (messageId) {
      const msgId = parseInt(messageId);
      const message = await Message.findById(msgId);
      if (message) {
        await Message.markAsRead(msgId, socket.userId);
        const io = getIO();
        io.to(`conversation:${message.conversation}`).emit('message:read', {
          messageId: msgId,
          userId: socket.userId,
          readAt: new Date()
        });
      }
    } else if (conversationId) {
      const convId = parseInt(conversationId);
      await Conversation.resetUnread(convId, socket.userId);
      await Message.updateMany(
        { conversation_id: convId, sender_id_ne: socket.userId },
        { status_read: true, readBy: { userId: socket.userId } }
      );
      const io = getIO();
      io.to(`conversation:${convId}`).emit('messages:read', {
        conversationId: convId,
        userId: socket.userId,
        readAt: new Date()
      });
    }
  } catch (error) {
    console.error('Error marking as read:', error);
  }
};

// Typing start
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

// Typing stop
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
    const msgId = parseInt(messageId);

    const message = await Message.findOne({ id: msgId, sender_id: socket.userId });
    if (!message) return socket.emit('error', { message: 'Message non trouvé' });

    const updated = await message.edit(content);

    const io = getIO();
    io.to(`conversation:${updated.conversation}`).emit('message:edited', updated);
  } catch (error) {
    console.error('Error editing message:', error);
    socket.emit('error', { message: "Erreur lors de l'édition" });
  }
};

// Supprimer un message
exports.handleMessageDelete = async (socket, data) => {
  try {
    const { messageId, forEveryone = false } = data;
    const msgId = parseInt(messageId);

    const message = await Message.findById(msgId);
    if (!message) return socket.emit('error', { message: 'Message non trouvé' });

    const senderId = message.sender ? message.sender.id : message.senderId;
    if (forEveryone && !sameId(senderId, socket.userId)) {
      return socket.emit('error', { message: 'Non autorisé' });
    }

    await message.softDelete(socket.userId, forEveryone);

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:deleted', {
      messageId: msgId,
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
  } catch (error) {
    console.error('Error joining conversation:', error);
  }
};

// Quitter une conversation
exports.handleConversationLeave = async (socket, data) => {
  try {
    const { conversationId } = data;
    socket.leave(`conversation:${conversationId}`);
  } catch (error) {
    console.error('Error leaving conversation:', error);
  }
};

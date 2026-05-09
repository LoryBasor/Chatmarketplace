// src/controllers/messageController.js
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const { getIO }    = require('../config/socket');

// Créer un message texte
exports.createMessage = async (req, res, next) => {
  try {
    const { conversationId, content, type = 'text', replyTo } = req.body;

    const convId = parseInt(conversationId);
    if (!convId) return res.status(400).json({ error: 'conversationId invalide' });

    const conversation = await Conversation.findOne({ id: convId, participant: req.userId });
    if (!conversation) return res.status(404).json({ error: 'Conversation non trouvée' });

    const message = await Message.create({
      conversation: convId,
      sender:       req.userId,
      content,
      type,
      replyTo: replyTo ? parseInt(replyTo) : null
    });

    // Mettre à jour la conversation
    await Conversation.updateLastMessage(convId, message.id, message.createdAt);

    // Incrémenter non-lus
    for (const participant of conversation.participants) {
      if (String(participant.id) !== String(req.userId)) {
        await Conversation.incrementUnread(convId, participant.id);
      }
    }

    // Émettre via Socket.IO
    const io = getIO();
    io.to(`conversation:${convId}`).emit('message:new', message);

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

// Récupérer les messages d'une conversation
exports.getMessages = async (req, res, next) => {
  try {
    const convId = parseInt(req.params.id);
    const { limit = 50, before } = req.query;

    const conversation = await Conversation.findOne({ id: convId, participant: req.userId });
    if (!conversation) return res.status(404).json({ error: 'Conversation non trouvée' });

    const messages = await Message.findByConversation(convId, {
      limit:  parseInt(limit),
      before: before || null,
      userId: req.userId
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
};

// Éditer un message
exports.editMessage = async (req, res, next) => {
  try {
    const msgId   = parseInt(req.params.id);
    const { content } = req.body;

    const message = await Message.findOne({ id: msgId, sender_id: req.userId });
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });

    const updated = await message.edit(content);

    const io = getIO();
    io.to(`conversation:${updated.conversation}`).emit('message:edited', updated);

    res.json({ message: updated });
  } catch (error) {
    next(error);
  }
};

// Supprimer un message
exports.deleteMessage = async (req, res, next) => {
  try {
    const msgId = parseInt(req.params.id);
    const { forEveryone = false } = req.body;

    const message = await Message.findById(msgId);
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });

    const senderId = message.sender ? message.sender.id : message.senderId;
    if (forEveryone && String(senderId) !== String(req.userId)) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await message.softDelete(req.userId, forEveryone);

    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:deleted', {
      messageId: msgId,
      forEveryone
    });

    res.json({ message: 'Message supprimé' });
  } catch (error) {
    next(error);
  }
};
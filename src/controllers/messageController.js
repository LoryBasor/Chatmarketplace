// src/controllers/messageController.js
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { getIO } = require('../config/socket');

// Créer un message
exports.createMessage = async (req, res, next) => {
  try {
    const { conversationId, content, type = 'text', replyTo } = req.body;

    // Vérifier que l'utilisateur fait partie de la conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.userId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation non trouvée' });
    }

    // Créer le message
    const message = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      content,
      type,
      replyTo
    });

    // Populer les informations
    await message.populate('sender', '-password');
    if (replyTo) await message.populate('replyTo');

    // Mettre à jour la conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;

    // Incrémenter le compteur de non lus pour les autres participants
    for (const participantId of conversation.participants) {
      if (participantId.toString() !== req.userId.toString()) {
        await conversation.incrementUnread(participantId);
      }
    }

    await conversation.save();

    // Émettre via Socket.IO
    const io = getIO();
    io.to(`conversation:${conversationId}`).emit('message:new', message);

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

// Récupérer les messages d'une conversation
exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    // Vérifier l'accès à la conversation
    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.userId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation non trouvée' });
    }

    const query = {
      conversation: id,
      deletedFor: { $ne: req.userId }
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', '-password')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ messages: messages.reverse() });
  } catch (error) {
    next(error);
  }
};

// Éditer un message
exports.editMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const message = await Message.findOne({ _id: id, sender: req.userId });

    if (!message) {
      return res.status(404).json({ error: 'Message non trouvé' });
    }

    await message.edit(content);
    await message.populate('sender', '-password');

    // Émettre via Socket.IO
    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:edited', message);

    res.json({ message });
  } catch (error) {
    next(error);
  }
};

// Supprimer un message
exports.deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { forEveryone = false } = req.body;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({ error: 'Message non trouvé' });
    }

    // Vérifier les permissions
    if (forEveryone && message.sender.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await message.softDelete(req.userId, forEveryone);

    // Émettre via Socket.IO
    const io = getIO();
    io.to(`conversation:${message.conversation}`).emit('message:deleted', {
      messageId: id,
      forEveryone
    });

    res.json({ message: 'Message supprimé' });
  } catch (error) {
    next(error);
  }
};
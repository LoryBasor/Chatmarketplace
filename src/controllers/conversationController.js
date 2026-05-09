// src/controllers/conversationController.js
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');

// Créer ou obtenir une conversation
exports.createOrGetConversation = async (req, res, next) => {
  try {
    const { participantId, type = 'individual' } = req.body;
    const currentUserId = req.userId;
    const pId = parseInt(participantId);

    if (!pId) return res.status(400).json({ error: 'participantId invalide' });

    // Chercher une conversation existante
    let conversation = await Conversation.findOne({
      type,
      participants_all: [currentUserId, pId],
      participants_size: 2
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUserId, pId],
        type
      });
    }

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
};

// Toutes les conversations de l'utilisateur
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.findByUser(req.userId);

    const conversationsWithUnread = conversations.map(conv => {
      const unreadCount = conv.unreadCount
        ? (conv.unreadCount[req.userId] || 0)
        : 0;
      return { ...conv, unreadCount };
    });

    res.json({ conversations: conversationsWithUnread });
  } catch (error) {
    next(error);
  }
};

// Une conversation spécifique
exports.getConversationById = async (req, res, next) => {
  try {
    const convId = parseInt(req.params.id);
    const conversation = await Conversation.findOne({ id: convId, participant: req.userId });

    if (!conversation) return res.status(404).json({ error: 'Conversation non trouvée' });

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
};

// Marquer comme lu
exports.markAsRead = async (req, res, next) => {
  try {
    const convId = parseInt(req.params.id);

    await Conversation.resetUnread(convId, req.userId);

    await Message.updateMany(
      { conversation_id: convId, sender_id_ne: req.userId },
      { status_read: true, readBy: { userId: req.userId } }
    );

    res.json({ message: 'Messages marqués comme lus' });
  } catch (error) {
    next(error);
  }
};

// src/controllers/conversationController.js
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Créer ou obtenir une conversation
exports.createOrGetConversation = async (req, res, next) => {
  try {
    const { participantId, type = 'individual' } = req.body;
    const currentUserId = req.userId;

    // Vérifier si une conversation existe déjà
    let conversation = await Conversation.findOne({
      type,
      participants: { $all: [currentUserId, participantId], $size: 2 }
    })
      .populate('participants', '-password')
      .populate('lastMessage');

    // Si la conversation n'existe pas, la créer
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUserId, participantId],
        type
      });

      conversation = await conversation
        .populate('participants', '-password');
    }

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
};

// Obtenir toutes les conversations de l'utilisateur
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isActive: true
    })
      .populate('participants', '-password')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    // Ajouter le compteur de non lus pour chaque conversation
    const conversationsWithUnread = conversations.map(conv => {
      const unreadCount = conv.unreadCount.get(req.userId.toString()) || 0;
      return {
        ...conv.toObject(),
        unreadCount
      };
    });

    res.json({ conversations: conversationsWithUnread });
  } catch (error) {
    next(error);
  }
};

// Obtenir une conversation spécifique
exports.getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.userId
    })
      .populate('participants', '-password')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation non trouvée' });
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
};

// Marquer les messages comme lus
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Réinitialiser le compteur de non lus
    const conversation = await Conversation.findById(id);
    await conversation.resetUnread(req.userId);

    // Marquer tous les messages non lus comme lus
    await Message.updateMany(
      {
        conversation: id,
        sender: { $ne: req.userId },
        'readBy.user': { $ne: req.userId }
      },
      {
        $push: { readBy: { user: req.userId, readAt: new Date() } },
        'status.read': true
      }
    );

    res.json({ message: 'Messages marqués comme lus' });
  } catch (error) {
    next(error);
  }
};

// src/routes/messages.js
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.use(auth);

// Messages texte
router.post('/', messageController.createMessage);
router.get('/conversation/:id', messageController.getMessages);
router.put('/:id', messageController.editMessage);
router.delete('/:id', messageController.deleteMessage);

// Messages avec médias
router.post('/media', upload.single('file'), async (req, res, next) => {
  try {
    const { conversationId, type, replyTo } = req.body;
    const Message = require('../models/Message');
    const Conversation = require('../models/Conversation');
    const { getIO } = require('../config/socket');

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.userId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation non trouvée' });
    }

    // Créer le message avec le média
    const message = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      type,
      media: {
        url: `/uploads/${type}s/${req.file.filename}`,
        filename: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size
      },
      replyTo
    });

    await message.populate('sender', '-password');
    if (replyTo) await message.populate('replyTo');

    // Mettre à jour la conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;

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
});

module.exports = router;
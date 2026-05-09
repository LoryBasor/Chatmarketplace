// src/routes/messages.js
const express = require('express');
const router  = express.Router();
const messageController = require('../controllers/messageController');
const auth   = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const { detectFileType } = require('../utils/helpers');
const { MEDIA_RETENTION_DAYS } = require('../utils/constants');

router.use(auth);

// Messages texte
router.post('/',                    messageController.createMessage);
router.get('/conversation/:id',     messageController.getMessages);
router.put('/:id',                  messageController.editMessage);
router.delete('/:id',               messageController.deleteMessage);

// ── Upload de médias via Cloudinary ────────────────────────────────────────
router.post(
  '/media',
  upload.single('file'),
  upload.validateFileSize,
  async (req, res, next) => {
    try {
      const { conversationId, replyTo } = req.body;
      const Message       = require('../models/Message');
      const Conversation  = require('../models/Conversation');
      const { getIO }     = require('../config/socket');

      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const convId = parseInt(conversationId);
      if (!convId) {
        return res.status(400).json({ error: 'conversationId invalide' });
      }

      // Vérifier l'accès
      const conversation = await Conversation.findOne({ id: convId, participant: req.userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation non trouvée' });
      }

      const fileType  = detectFileType(req.file.mimetype);
      const mediaUrl  = req.file.path || req.file.secure_url;
      const publicId  = req.file.filename || req.file.public_id;

      // Calculer la date d'expiration
      const retentionDays = MEDIA_RETENTION_DAYS[fileType] || 90;
      let expiresAt = null;
      if (retentionDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + retentionDays);
      }

      // Créer le message avec expiration
      const message = await Message.create({
        conversation:    convId,
        sender:          req.userId,
        type:            fileType,
        media_url:       mediaUrl,
        media_filename:  req.file.originalname || publicId,
        media_mime_type: req.file.mimetype,
        media_size:      req.file.size,
        media_expires_at: expiresAt,
        replyTo:         replyTo ? parseInt(replyTo) : null
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

      // Infos sur l'expiration dans la réponse
      const expiryInfo = expiresAt ? {
        expiresAt,
        daysLeft: retentionDays,
        expiresIn: `${retentionDays} jours`
      } : { expiresAt: null, permanent: true };

      res.status(201).json({ message, expiry: expiryInfo });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
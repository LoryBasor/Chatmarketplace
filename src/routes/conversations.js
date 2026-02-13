// src/routes/conversations.js
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const auth = require('../middlewares/auth');

router.use(auth);

router.post('/', conversationController.createOrGetConversation);
router.get('/', conversationController.getConversations);
router.get('/:id', conversationController.getConversationById);
router.put('/:id/read', conversationController.markAsRead);

module.exports = router;
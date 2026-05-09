// public/js/socket.js — Client Socket.IO (corrigé)

let socket = null;

// Helper comparaison d'IDs (Number ou String)
const sameId = (a, b) => String(a) === String(b);

function initSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10
  });

  // ─── Connexion ───────────────────────────────────
  socket.on('connect', () => {
    console.log('✅ Socket.IO connecté:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Erreur Socket.IO:', error.message);
    if (error.message && error.message.includes('Authentication')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket.IO déconnecté:', reason);
  });

  socket.on('reconnect', (n) => {
    console.log('Socket.IO reconnecté après', n, 'tentatives');
    // Recharger les conversations après reconnexion
    if (typeof loadConversations === 'function') loadConversations();
  });

  // ─── MESSAGES ────────────────────────────────────

  // Nouveau message
  socket.on('message:new', (message) => {
    console.log('📨 Nouveau message:', message);
    handleNewMessage(message);
  });

  // Confirmation d'envoi (remplace le message temporaire)
  socket.on('message:sent', ({ tempId, message }) => {
    const index = messages.findIndex(m => m.id === tempId || m._id === tempId);
    if (index !== -1) {
      messages[index] = message;
    } else {
      // Si pas trouvé (double event), éviter les doublons
      const exists = messages.find(m => sameId(m.id, message.id));
      if (!exists) messages.push(message);
    }
    displayMessages();
    scrollToBottom();
  });

  // Message livré
  socket.on('message:delivered', ({ messageId, userId, deliveredAt }) => {
    const msg = messages.find(m => sameId(m.id, messageId));
    if (msg) {
      msg.status = msg.status || {};
      msg.status.delivered = true;
      updateMessageStatus(msg.id);
    }
  });

  // Message lu (un seul)
  socket.on('message:read', ({ messageId, userId, readAt }) => {
    const msg = messages.find(m => sameId(m.id, messageId));
    if (msg) {
      msg.status = msg.status || {};
      msg.status.read = true;
      updateMessageStatus(msg.id);
    }
  });

  // Tous les messages d'une conversation lus
  socket.on('messages:read', ({ conversationId, userId, readAt }) => {
    if (!currentConversation || !sameId(currentConversation.id, conversationId)) return;
    // Marquer tous les messages envoyés par moi comme lus
    messages.forEach(msg => {
      const senderId = msg.sender ? msg.sender.id : msg.senderId;
      if (sameId(senderId, currentUser.id)) {
        msg.status = msg.status || {};
        msg.status.read = true;
      }
    });
    displayMessages();
  });

  // Message édité
  socket.on('message:edited', (editedMessage) => {
    const index = messages.findIndex(m => sameId(m.id, editedMessage.id));
    if (index !== -1) {
      messages[index] = editedMessage;
      displayMessages();
    }
  });

  // Message supprimé
  socket.on('message:deleted', ({ messageId, forEveryone }) => {
    if (forEveryone) {
      messages = messages.filter(m => !sameId(m.id, messageId));
    } else {
      const msg = messages.find(m => sameId(m.id, messageId));
      if (msg) msg.isDeleted = true;
    }
    displayMessages();
  });

  // ─── STATUT UTILISATEURS ─────────────────────────

  socket.on('user:online', ({ userId }) => {
    if (currentConversation) {
      const u = currentConversation.participants
        ? currentConversation.participants.find(p => sameId(p.id, userId))
        : null;
      if (u) { u.isOnline = true; updateUserStatus(u); }
    }
    conversations.forEach(conv => {
      if (conv.participants) {
        const u = conv.participants.find(p => sameId(p.id, userId));
        if (u) u.isOnline = true;
      }
    });
  });

  socket.on('user:offline', ({ userId, lastSeen }) => {
    if (currentConversation) {
      const u = currentConversation.participants
        ? currentConversation.participants.find(p => sameId(p.id, userId))
        : null;
      if (u) { u.isOnline = false; u.lastSeen = lastSeen; updateUserStatus(u); }
    }
    conversations.forEach(conv => {
      if (conv.participants) {
        const u = conv.participants.find(p => sameId(p.id, userId));
        if (u) { u.isOnline = false; u.lastSeen = lastSeen; }
      }
    });
  });

  // ─── TYPING ──────────────────────────────────────

  socket.on('typing:user', ({ userId, conversationId, isTyping }) => {
    if (!currentConversation || !sameId(currentConversation.id, conversationId)) return;
    if (sameId(userId, currentUser.id)) return; // ignorer le propre typing

    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.style.display = isTyping ? 'block' : 'none';
    }
  });

  // ─── ERREURS ─────────────────────────────────────

  socket.on('error', ({ message }) => {
    console.error('❌ Socket error:', message);
    if (typeof showToast === 'function') showToast(message, 'error');
  });

  window.socket = socket;
}

// ─── Gestion d'un nouveau message ──────────────────
function handleNewMessage(message) {
  const isCurrentConv = currentConversation &&
    sameId(message.conversation || message.conversationId, currentConversation.id);

  if (isCurrentConv) {
    // Éviter les doublons (si déjà ajouté via message:sent)
    const exists = messages.find(m => sameId(m.id, message.id));
    if (!exists) {
      messages.push(message);
      displayMessages();
      scrollToBottom();
    }

    // Marquer comme lu si la fenêtre est active
    if (document.hasFocus()) {
      socket.emit('message:read', {
        messageId: message.id,
        conversationId: message.conversation
      });
    }

    // Marquer comme livré
    socket.emit('message:delivered', { messageId: message.id });

  } else {
    // Notification pour les autres conversations
    const senderName  = message.sender ? message.sender.name : 'Quelqu\'un';
    const senderAvatar = message.sender ? message.sender.avatar : null;
    const preview     = message.type === 'text'
      ? (message.content || '').substring(0, 60)
      : getMessagePreview(message);

    if (window.notificationManager) {
      window.notificationManager.showMessage(
        senderName,
        preview,
        message.conversation,
        senderAvatar
      );
    }

    // Mettre à jour la badge dans la liste
    const conv = conversations.find(c => sameId(c.id, message.conversation));
    if (conv) {
      if (typeof conv.unreadCount === 'object') {
        conv.unreadCount[currentUser.id] = (conv.unreadCount[currentUser.id] || 0) + 1;
      } else {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
      }
      conv.lastMessage    = message;
      conv.lastMessageAt  = message.createdAt;
    } else {
      // Nouvelle conversation — recharger
      loadConversations();
      return;
    }

    displayConversations();
  }
}

// Mettre à jour le statut d'un message dans le DOM sans re-rendre tout
function updateMessageStatus(messageId) {
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) { displayMessages(); return; }
  const msg = messages.find(m => sameId(m.id, messageId));
  if (!msg) return;
  const timeEl = msgEl.querySelector('.message-time');
  if (timeEl) {
    const statusEl = timeEl.querySelector('.message-status');
    if (statusEl) statusEl.remove();
    const newStatus = document.createElement('span');
    if (msg.status && msg.status.read)      { newStatus.className = 'message-status read'; newStatus.textContent = '✓✓'; }
    else if (msg.status && msg.status.delivered) { newStatus.className = 'message-status'; newStatus.textContent = '✓✓'; }
    else                                    { newStatus.className = 'message-status'; newStatus.textContent = '✓'; }
    timeEl.appendChild(newStatus);
  }
}

// Initialiser Socket.IO au chargement
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('token')) {
    initSocket();
  }
});
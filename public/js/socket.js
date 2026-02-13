// public/js/socket.js - Client Socket.IO

let socket = null;

// Initialiser Socket.IO
function initSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  // Connexion établie
  socket.on('connect', () => {
    console.log('✅ Socket.IO connecté:', socket.id);
  });

  // Erreur de connexion
  socket.on('connect_error', (error) => {
    console.error('❌ Erreur Socket.IO:', error.message);
    
    if (error.message.includes('Authentication')) {
      // Token invalide, rediriger vers la connexion
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
  });

  // Déconnexion
  socket.on('disconnect', (reason) => {
    console.log('Socket.IO déconnecté:', reason);
  });

  // Reconnexion
  socket.on('reconnect', (attemptNumber) => {
    console.log('Socket.IO reconnecté après', attemptNumber, 'tentatives');
  });

  // === ÉVÉNEMENTS DE MESSAGES ===

  // Nouveau message reçu
  socket.on('message:new', (message) => {
    console.log('📨 Nouveau message:', message);
    handleNewMessage(message);
  });

  // Message envoyé avec succès
  socket.on('message:sent', ({ tempId, message }) => {
    console.log('✅ Message envoyé:', message);
    
    // Remplacer le message temporaire par le vrai
    const index = messages.findIndex(m => m._id === tempId);
    if (index !== -1) {
      messages[index] = message;
      displayMessages();
    }
  });

  // Message livré
  socket.on('message:delivered', ({ messageId, userId, deliveredAt }) => {
    const msg = messages.find(m => m._id === messageId);
    if (msg) {
      msg.status.delivered = true;
      if (!msg.deliveredTo) msg.deliveredTo = [];
      msg.deliveredTo.push({ user: userId, deliveredAt });
      displayMessages();
    }
  });

  // Message lu
  socket.on('message:read', ({ messageId, userId, readAt }) => {
    const msg = messages.find(m => m._id === messageId);
    if (msg) {
      msg.status.read = true;
      if (!msg.readBy) msg.readBy = [];
      msg.readBy.push({ user: userId, readAt });
      displayMessages();
    }
  });

  // Tous les messages d'une conversation lus
  socket.on('messages:read', ({ conversationId, userId, readAt }) => {
    if (currentConversation && currentConversation._id === conversationId) {
      messages.forEach(msg => {
        if (msg.sender.id === currentUser.id) {
          msg.status.read = true;
        }
      });
      displayMessages();
    }
  });

  // Message édité
  socket.on('message:edited', (editedMessage) => {
    const index = messages.findIndex(m => m._id === editedMessage._id);
    if (index !== -1) {
      messages[index] = editedMessage;
      displayMessages();
    }
  });

  // Message supprimé
  socket.on('message:deleted', ({ messageId, forEveryone }) => {
    if (forEveryone) {
      messages = messages.filter(m => m._id !== messageId);
    } else {
      const msg = messages.find(m => m._id === messageId);
      if (msg) {
        msg.isDeleted = true;
      }
    }
    displayMessages();
  });

  // === ÉVÉNEMENTS DE STATUT UTILISATEUR ===

  // Utilisateur en ligne
  socket.on('user:online', ({ userId, timestamp }) => {
    console.log('👤 Utilisateur en ligne:', userId);
    
    // Mettre à jour le statut dans la conversation actuelle
    if (currentConversation) {
      const otherUser = currentConversation.participants.find(p => p.id === userId);
      if (otherUser) {
        otherUser.isOnline = true;
        updateUserStatus(otherUser);
      }
    }

    // Mettre à jour dans la liste des conversations
    conversations.forEach(conv => {
      const user = conv.participants.find(p => p.id === userId);
      if (user) user.isOnline = true;
    });
  });

  // Utilisateur hors ligne
  socket.on('user:offline', ({ userId, lastSeen }) => {
    console.log('👤 Utilisateur hors ligne:', userId);
    
    if (currentConversation) {
      const otherUser = currentConversation.participants.find(p => p.id === userId);
      if (otherUser) {
        otherUser.isOnline = false;
        otherUser.lastSeen = lastSeen;
        updateUserStatus(otherUser);
      }
    }

    conversations.forEach(conv => {
      const user = conv.participants.find(p => p.id === userId);
      if (user) {
        user.isOnline = false;
        user.lastSeen = lastSeen;
      }
    });
  });

  // === ÉVÉNEMENTS DE SAISIE ===

  // Utilisateur en train d'écrire
  socket.on('typing:user', ({ userId, conversationId, isTyping }) => {
    if (currentConversation && currentConversation._id === conversationId) {
      const indicator = document.getElementById('typingIndicator');
      
      if (isTyping && userId !== currentUser.id) {
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }
  });

  // === GESTION DES ERREURS ===

  socket.on('error', ({ message }) => {
    console.error('❌ Erreur Socket.IO:', message);
    showNotification('Erreur', message, 'error');
  });

  // Exposer le socket globalement
  window.socket = socket;
}

// Gérer un nouveau message
function handleNewMessage(message) {
  // Si c'est dans la conversation actuelle
  if (currentConversation && message.conversation === currentConversation._id) {
    messages.push(message);
    displayMessages();
    scrollToBottom();

    // Marquer automatiquement comme lu si la fenêtre est active
    if (document.hasFocus()) {
      socket.emit('message:read', {
        messageId: message._id,
        conversationId: message.conversation
      });
    }

    // Marquer comme livré
    socket.emit('message:delivered', {
      messageId: message._id
    });
  } else {
    // Afficher une notification
    showNotification(
      message.sender.name,
      message.type === 'text' ? message.content : getMessagePreview(message),
      'message',
      () => {
        // Ouvrir la conversation au clic
        selectConversation(message.conversation);
      }
    );
  }

  // Mettre à jour la liste des conversations
  loadConversations();
}

// Afficher une notification
function showNotification(title, body, type = 'info', onClick = null) {
  // Vérifier si les notifications sont supportées
  if (!('Notification' in window)) return;

  // Demander la permission si nécessaire
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/images/logo.png',
      badge: '/images/badge.png',
      tag: 'instantchat',
      requireInteraction: false
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    setTimeout(() => notification.close(), 5000);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showNotification(title, body, type, onClick);
      }
    });
  }
}

// Initialiser Socket.IO au chargement
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('token')) {
    initSocket();
  }
});
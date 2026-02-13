// public/js/app.js - Application principale de chat

const API_URL = window.location.origin + '/api';
let currentUser = null;
let currentConversation = null;
let conversations = [];
let messages = [];
let replyToMessage = null;
let typingTimeout = null;

// Vérifier l'authentification
function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    window.location.href = '/';
    return false;
  }
  
  currentUser = JSON.parse(user);
  return token;
}

// Headers pour les requêtes API
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
}

// Initialisation
async function init() {
  const token = checkAuth();
  if (!token) return;

  // Afficher les infos de l'utilisateur
  document.getElementById('currentUserName').textContent = currentUser.name;
  document.getElementById('currentUserAvatar').src = 
    currentUser.avatar ? `/uploads/images/${currentUser.avatar}` : '/images/default-avatar.png';

  // Charger les conversations
  await loadConversations();

  // Initialiser les événements
  setupEventListeners();
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
  // Déconnexion
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  });

  // Recherche d'utilisateurs
  const searchInput = document.getElementById('userSearch');
  const searchResults = document.getElementById('searchResults');

  searchInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      searchResults.classList.remove('show');
      return;
    }

    await searchUsers(query);
  }, 300));

  // Cliquer en dehors pour fermer les résultats
  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.classList.remove('show');
    }
  });

  // Envoi de message
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Indicateur de saisie
  messageInput.addEventListener('input', () => {
    if (currentConversation && window.socket) {
      clearTimeout(typingTimeout);
      
      window.socket.emit('typing:start', {
        conversationId: currentConversation._id
      });

      typingTimeout = setTimeout(() => {
        window.socket.emit('typing:stop', {
          conversationId: currentConversation._id
        });
      }, 1000);
    }
  });

  // Upload de fichier
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');

  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', handleFileSelect);

  // Annuler la réponse
  document.getElementById('cancelReply').addEventListener('click', () => {
    replyToMessage = null;
    document.getElementById('replyPreview').style.display = 'none';
  });
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Charger les conversations
async function loadConversations() {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Erreur lors du chargement des conversations');

    const data = await response.json();
    conversations = data.conversations;

    displayConversations();
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Afficher les conversations
function displayConversations() {
  const container = document.getElementById('conversationsList');

  if (conversations.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune conversation</p>';
    return;
  }

  container.innerHTML = conversations.map(conv => {
    const otherUser = conv.participants.find(p => p.id !== currentUser.id);
    const lastMsg = conv.lastMessage;
    const time = lastMsg ? formatTime(lastMsg.createdAt) : '';
    const preview = lastMsg ? getMessagePreview(lastMsg) : 'Aucun message';

    return `
      <div class="conversation-item ${conv._id === currentConversation?._id ? 'active' : ''}"
           data-conversation-id="${conv._id}"
           onclick="selectConversation('${conv._id}')">
        <img src="${otherUser.avatar ? '/uploads/images/' + otherUser.avatar : '/images/default-avatar.png'}" 
             alt="${otherUser.name}">
        <div class="conversation-info">
          <div class="conversation-header">
            <span class="conversation-name">${otherUser.name}</span>
            <span class="conversation-time">${time}</span>
          </div>
          <p class="conversation-preview">${preview}</p>
        </div>
        ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
      </div>
    `;
  }).join('');
}

// Prévisualisation du message
function getMessagePreview(message) {
  if (message.type === 'text') {
    return message.content.substring(0, 50);
  }
  const icons = {
    image: '📷 Photo',
    video: '🎥 Vidéo',
    audio: '🎤 Audio',
    document: '📄 Document'
  };
  return icons[message.type] || 'Message';
}

// Formater le temps
function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Hier';
  } else if (days < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }
}

// Rechercher des utilisateurs
async function searchUsers(query) {
  try {
    const response = await fetch(`${API_URL}/users?search=${encodeURIComponent(query)}`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Erreur de recherche');

    const data = await response.json();
    displaySearchResults(data.users);
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Afficher les résultats de recherche
function displaySearchResults(users) {
  const container = document.getElementById('searchResults');

  if (users.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun utilisateur trouvé</p>';
    container.classList.add('show');
    return;
  }

  container.innerHTML = users.map(user => `
    <div class="search-result-item" onclick="startConversation('${user.id}')">
      <img src="${user.avatar ? '/uploads/images/' + user.avatar : '/images/default-avatar.png'}" 
           alt="${user.name}">
      <div>
        <strong>${user.name}</strong>
        <p style="font-size: 0.85rem; color: var(--text-secondary);">${user.email}</p>
      </div>
    </div>
  `).join('');

  container.classList.add('show');
}

// Démarrer une conversation
async function startConversation(userId) {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ participantId: userId })
    });

    if (!response.ok) throw new Error('Erreur lors de la création de la conversation');

    const data = await response.json();
    
    // Fermer les résultats de recherche
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('userSearch').value = '';

    // Recharger les conversations et sélectionner la nouvelle
    await loadConversations();
    selectConversation(data.conversation._id);

  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Sélectionner une conversation
async function selectConversation(conversationId) {
  const conversation = conversations.find(c => c._id === conversationId);
  if (!conversation) return;

  currentConversation = conversation;
  messages = [];

  // Mettre à jour l'UI
  document.getElementById('emptyChat').style.display = 'none';
  document.getElementById('chatActive').style.display = 'flex';

  const otherUser = conversation.participants.find(p => p.id !== currentUser.id);
  
  document.getElementById('chatUserName').textContent = otherUser.name;
  document.getElementById('chatUserAvatar').src = 
    otherUser.avatar ? `/uploads/images/${otherUser.avatar}` : '/images/default-avatar.png';
  
  updateUserStatus(otherUser);

  // Charger les messages
  await loadMessages(conversationId);

  // Marquer comme lu
  markConversationAsRead(conversationId);

  // Rejoindre la room Socket.IO
  if (window.socket) {
    window.socket.emit('conversation:join', { conversationId });
  }

  // Mettre à jour la liste des conversations
  displayConversations();
}

// Charger les messages
async function loadMessages(conversationId) {
  try {
    const response = await fetch(`${API_URL}/messages/conversation/${conversationId}`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Erreur lors du chargement des messages');

    const data = await response.json();
    messages = data.messages;

    displayMessages();
    scrollToBottom();
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Afficher les messages
function displayMessages() {
  const container = document.getElementById('messagesContainer');

  if (messages.length === 0) {
    container.innerHTML = '<div class="messages-loading">Aucun message</div>';
    return;
  }

  container.innerHTML = messages.map(msg => createMessageHTML(msg)).join('');
}

// Créer le HTML d'un message
function createMessageHTML(message) {
  const isSent = message.sender._id === currentUser.id;
  const time = new Date(message.createdAt).toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  let content = '';

  if (message.type === 'text') {
    content = `<div class="message-content">${escapeHtml(message.content)}</div>`;
  } else if (message.media) {
    if (message.type === 'image') {
      content = `
        <div class="message-media">
          <img src="${message.media.url}" alt="Image" onclick="openMediaModal('${message.media.url}', 'image')">
        </div>
      `;
    } else if (message.type === 'video') {
      content = `
        <div class="message-media">
          <video controls src="${message.media.url}"></video>
        </div>
      `;
    } else {
      content = `
        <div class="message-content">
          📄 ${message.media.filename}
        </div>
      `;
    }
  }

  const statusIcon = isSent ? getStatusIcon(message.status) : '';

  return `
    <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message._id}">
      <div class="message-bubble">
        ${content}
        <div class="message-time">
          ${time}
          ${statusIcon}
        </div>
      </div>
    </div>
  `;
}

// Icône de statut du message
function getStatusIcon(status) {
  if (status.read) return '<span class="message-status read">✅</span>';
  if (status.delivered) return '<span class="message-status">✓✓</span>';
  return '<span class="message-status">✓</span>';
}

// Échapper le HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// Envoyer un message
async function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();

  if (!content || !currentConversation) return;

  const tempId = Date.now();
  const tempMessage = {
    _id: tempId,
    conversation: currentConversation._id,
    sender: currentUser,
    content,
    type: 'text',
    createdAt: new Date(),
    status: { sent: true, delivered: false, read: false }
  };

  // Ajouter le message temporairement
  messages.push(tempMessage);
  displayMessages();
  scrollToBottom();

  input.value = '';

  // Arrêter l'indicateur de saisie
  if (window.socket) {
    window.socket.emit('typing:stop', {
      conversationId: currentConversation._id
    });
  }

  // Envoyer via Socket.IO
  if (window.socket) {
    window.socket.emit('message:send', {
      conversationId: currentConversation._id,
      content,
      type: 'text',
      replyTo: replyToMessage?._id,
      tempId
    });
  }

  // Réinitialiser la réponse
  replyToMessage = null;
  document.getElementById('replyPreview').style.display = 'none';
}

// Gérer la sélection de fichier
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Afficher l'aperçu
  const preview = document.getElementById('filePreview');
  const reader = new FileReader();

  reader.onload = (e) => {
    if (file.type.startsWith('image/')) {
      preview.innerHTML = `
        <div class="file-preview-item">
          <img src="${e.target.result}" alt="Preview">
          <button onclick="sendMediaFile('image')">Envoyer</button>
          <button onclick="cancelFilePreview()">Annuler</button>
        </div>
      `;
    } else {
      preview.innerHTML = `
        <div class="file-preview-item">
          <span>📄 ${file.name}</span>
          <button onclick="sendMediaFile('document')">Envoyer</button>
          <button onclick="cancelFilePreview()">Annuler</button>
        </div>
      `;
    }
    preview.style.display = 'block';
  };

  reader.readAsDataURL(file);
}

// Envoyer un fichier média
async function sendMediaFile(type) {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];

  if (!file || !currentConversation) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('conversationId', currentConversation._id);
  formData.append('type', type);

  try {
    const response = await fetch(`${API_URL}/messages/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });

    if (!response.ok) throw new Error('Erreur lors de l\'envoi du fichier');

    cancelFilePreview();
    await loadMessages(currentConversation._id);
  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur lors de l\'envoi du fichier');
  }
}

// Annuler l'aperçu du fichier
function cancelFilePreview() {
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

// Ouvrir le modal média
function openMediaModal(url, type) {
  const modal = document.getElementById('mediaModal');
  const content = document.getElementById('mediaModalContent');

  if (type === 'image') {
    content.innerHTML = `<img src="${url}" alt="Image">`;
  } else if (type === 'video') {
    content.innerHTML = `<video controls src="${url}"></video>`;
  }

  modal.style.display = 'flex';

  modal.querySelector('.modal-close').onclick = () => {
    modal.style.display = 'none';
  };

  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
}

// Marquer une conversation comme lue
async function markConversationAsRead(conversationId) {
  try {
    await fetch(`${API_URL}/conversations/${conversationId}/read`, {
      method: 'PUT',
      headers: getHeaders()
    });

    // Réinitialiser le compteur local
    const conv = conversations.find(c => c._id === conversationId);
    if (conv) {
      conv.unreadCount = 0;
      displayConversations();
    }
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Mettre à jour le statut de l'utilisateur
function updateUserStatus(user) {
  const statusEl = document.getElementById('chatUserStatus');
  
  if (user.isOnline) {
    statusEl.textContent = 'En ligne';
    statusEl.classList.add('online');
  } else {
    statusEl.textContent = `Vu ${formatTime(user.lastSeen)}`;
    statusEl.classList.remove('online');
  }
}

// Faire défiler vers le bas
function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', init);

// Exposer les fonctions globales
window.selectConversation = selectConversation;
window.startConversation = startConversation;
window.sendMediaFile = sendMediaFile;
window.cancelFilePreview = cancelFilePreview;
window.openMediaModal = openMediaModal;
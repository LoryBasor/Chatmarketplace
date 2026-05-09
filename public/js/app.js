// public/js/app.js — Application principale de chat (refonte complète)

const API_URL = window.location.origin + '/api';
let currentUser        = null;
let currentConversation = null;
let conversations      = [];
let messages           = [];
let replyToMessage     = null;
let typingTimeout      = null;

// ─────────────────────────────────────────
// AUTHENTIFICATION
// ─────────────────────────────────────────
function checkAuth() {
  const token = localStorage.getItem('token');
  const user  = localStorage.getItem('user');
  if (!token || !user) { window.location.href = '/'; return false; }
  currentUser = JSON.parse(user);
  return token;
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  };
}

// ─────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────
async function init() {
  const token = checkAuth();
  if (!token) return;

  document.getElementById('currentUserName').textContent = currentUser.name;
  document.getElementById('currentUserAvatar').src =
    currentUser.avatar ? currentUser.avatar : '/images/default-avatar.png';

  await loadConversations();
  setupEventListeners();
}

// ─────────────────────────────────────────
// HELPERS MOBILE
// ─────────────────────────────────────────
function isMobile() {
  return window.innerWidth <= 640;
}

// Glisser vers le panneau Chat (deux-panneaux)
function showChatMobile() {
  if (!isMobile()) return;
  document.getElementById('chatContainer').classList.add('show-chat');
}

// Glisser vers le panneau Sidebar
function showSidebarMobile() {
  if (!isMobile()) return;
  document.getElementById('chatContainer').classList.remove('show-chat');
  currentConversation = null;
  window.currentConversation = null;
}

// ─────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────
function setupEventListeners() {
  // Déconnexion
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  });

  // Bouton retour (mobile)
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showSidebarMobile();
      document.getElementById('chatActive').style.display = 'none';
      document.getElementById('emptyChat').style.display  = 'flex';
    });
  }

  // Recherche d'utilisateurs
  const searchInput   = document.getElementById('userSearch');
  const searchResults = document.getElementById('searchResults');

  searchInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) { searchResults.classList.remove('show'); return; }
    await searchUsers(query);
  }, 300));

  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.classList.remove('show');
    }
  });

  // Envoi de message (Entrée)
  const messageInput = document.getElementById('messageInput');
  const sendBtn      = document.getElementById('sendBtn');

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);

  // Typing indicator
  messageInput.addEventListener('input', () => {
    if (!currentConversation || !window.socket) return;
    clearTimeout(typingTimeout);
    window.socket.emit('typing:start', { conversationId: currentConversation.id });
    typingTimeout = setTimeout(() => {
      window.socket.emit('typing:stop', { conversationId: currentConversation.id });
    }, 1500);
  });

  // Upload fichier
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  // Annuler réponse
  document.getElementById('cancelReply').addEventListener('click', () => {
    replyToMessage = null;
    document.getElementById('replyPreview').style.display = 'none';
  });

  // Message vocal
  document.getElementById('audioBtn').addEventListener('click', toggleAudioRecording);

  // Gérer le redimensionnement
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      // Restaurer état desktop : annuler la translation
      document.getElementById('chatContainer').classList.remove('show-chat');
    }
  });
}

// ─────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────
async function loadConversations() {
  try {
    const response = await fetch(`${API_URL}/conversations`, { headers: getHeaders() });
    if (!response.ok) throw new Error('Erreur chargement conversations');
    const data = await response.json();
    conversations = data.conversations || [];
    displayConversations();
  } catch (error) {
    console.error('loadConversations:', error);
  }
}

function displayConversations() {
  const container = document.getElementById('conversationsList');
  
  // Sauvegarder la position de défilement pour ne pas perturber l'utilisateur
  const scrollTop = container.scrollTop;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune conversation</p>';
    return;
  }

  // Trier par dernier message (le plus récent en haut)
  const sortedConversations = [...conversations].sort((a, b) => {
    const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return timeB - timeA;
  });

  container.innerHTML = sortedConversations.map(conv => {
    const otherUser = conv.participants
      ? conv.participants.find(p => String(p.id) !== String(currentUser.id))
      : null;
    if (!otherUser) return '';

    const lastMsg = conv.lastMessage;
    const time    = lastMsg ? formatTime(lastMsg.createdAt) : '';
    const preview = lastMsg ? getMessagePreview(lastMsg) : 'Aucun message';
    const unread  = typeof conv.unreadCount === 'object'
      ? (conv.unreadCount[currentUser.id] || 0)
      : (conv.unreadCount || 0);
    const isActive = currentConversation && String(conv.id) === String(currentConversation.id);

    return `
      <div class="conversation-item ${isActive ? 'active' : ''}"
           data-conversation-id="${conv.id}"
           onclick="selectConversation(${conv.id})">
        <img src="${otherUser.avatar || '/images/default-avatar.png'}" alt="${escapeHtml(otherUser.name)}">
        <div class="conversation-info">
          <div class="conversation-header">
            <span class="conversation-name">${escapeHtml(otherUser.name)}</span>
            <span class="conversation-time">${time}</span>
          </div>
          <p class="conversation-preview">${escapeHtml(preview)}</p>
        </div>
        ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>
    `;
  }).join('');
  
  // Restaurer la position de défilement
  container.scrollTop = scrollTop;
}

async function startConversation(userId) {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ participantId: userId })
    });
    if (!response.ok) throw new Error('Erreur création conversation');
    const data = await response.json();

    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('userSearch').value = '';

    await loadConversations();
    await selectConversation(data.conversation.id);
  } catch (error) {
    console.error('startConversation:', error);
  }
}

async function selectConversation(conversationId) {
  const convId = parseInt(conversationId);
  const conversation = conversations.find(c => c.id === convId);
  if (!conversation) return;

  currentConversation = conversation;
  window.currentConversation = currentConversation; // exposé pour notifications.js
  messages = [];

  // ── Desktop : afficher le chat dans la zone principale
  document.getElementById('emptyChat').style.display  = 'none';
  document.getElementById('chatActive').style.display = 'flex';

  // ── Mobile : glisser la sidebar hors écran
  showChatMobile();

  const otherUser = conversation.participants
    ? conversation.participants.find(p => String(p.id) !== String(currentUser.id))
    : null;

  if (otherUser) {
    document.getElementById('chatUserName').textContent = otherUser.name;
    document.getElementById('chatUserAvatar').src       = otherUser.avatar || '/images/default-avatar.png';
    updateUserStatus(otherUser);
  }

  await loadMessages(convId);
  markConversationAsRead(convId);

  if (window.socket) {
    window.socket.emit('conversation:join', { conversationId: convId });
  }

  displayConversations();
  // Mettre le focus sur l'input
  setTimeout(() => {
    const input = document.getElementById('messageInput');
    if (input) input.focus();
  }, 100);
}

// ─────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────
async function loadMessages(conversationId) {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '<div class="messages-loading">Chargement...</div>';
  try {
    const response = await fetch(`${API_URL}/messages/conversation/${conversationId}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Erreur chargement messages');
    const data = await response.json();
    messages = data.messages || [];
    displayMessages();
    scrollToBottom();
  } catch (error) {
    console.error('loadMessages:', error);
    container.innerHTML = '<div class="messages-loading">Erreur de chargement</div>';
  }
}

// ─────────────────────────────────────────
// SYNCHRONISATION SILENCIEUSE
// ─────────────────────────────────────────
async function silentSync() {
  if (!localStorage.getItem('token')) return;

  try {
    // 1. Sync des conversations
    const convRes = await fetch(`${API_URL}/conversations`, { headers: getHeaders() });
    if (convRes.ok) {
      const data = await convRes.json();
      const newConversations = data.conversations || [];
      
      // On compare pour ne rafraichir le DOM que si nécessaire (évite le lag ou flash)
      if (JSON.stringify(conversations) !== JSON.stringify(newConversations)) {
        conversations = newConversations;
        displayConversations();
      }
    }

    // 2. Sync des messages si une conversation est active
    if (currentConversation) {
      const msgRes = await fetch(`${API_URL}/messages/conversation/${currentConversation.id}`, { headers: getHeaders() });
      if (msgRes.ok) {
        const data = await msgRes.json();
        const newMessages = data.messages || [];
        
        // Comparer intelligemment les messages actuels et les nouveaux pour détecter tout changement (statuts, etc)
        const currentMsgsStr = JSON.stringify(messages);
        const newMsgsStr = JSON.stringify(newMessages);

        if (currentMsgsStr !== newMsgsStr) {
          const container = document.getElementById('messagesContainer');
          // Vérifier si l'utilisateur est déjà tout en bas
          const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
          
          messages = newMessages;
          displayMessages();
          
          if (isAtBottom) scrollToBottom();
        }
      }
    }
  } catch (err) {
    // Échec silencieux
  }
}

function displayMessages() {
  const container = document.getElementById('messagesContainer');
  if (messages.length === 0) {
    container.innerHTML = '<div class="messages-loading">Aucun message — Commencez la conversation !</div>';
    return;
  }
  container.innerHTML = messages.map(msg => createMessageHTML(msg)).join('');
}

function createMessageHTML(message) {
  // Comparer les IDs de façon sûre (Number vs Number)
  const senderId = message.sender ? message.sender.id : message.senderId;
  const isSent   = String(senderId) === String(currentUser.id);

  const time = new Date(message.createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit'
  });

  let content = '';

  // Médias expirés
  if (message.mediaExpired) {
    const typeName = { image:'l\'image', video:'la vidéo', audio:'l\'audio', document:'le document' }[message.type] || 'le média';
    content = `
      <div class="media-expired">
        <span class="media-expired-icon">⏳</span>
        <span>Ce média n’est plus disponible</span>
      </div>`;
  } else if (message.isDeleted) {
    content = `<div class="message-content deleted">🚫 Message supprimé</div>`;
  } else if (message.type === 'text') {
    content = `<div class="message-content">${escapeHtml(message.content || '')}</div>`;
  } else if (message.media) {
    if (message.type === 'image') {
      content = `
        <div class="message-media">
          <img src="${message.media.url}" alt="Image"
               onclick="openMediaModal('${message.media.url}', 'image')"
               loading="lazy">
        </div>`;
    } else if (message.type === 'video') {
      content = `
        <div class="message-media">
          <video controls preload="metadata" src="${message.media.url}"></video>
        </div>`;
    } else if (message.type === 'audio') {
      content = `
        <div class="message-audio">
          🎤 <audio controls preload="metadata" src="${message.media.url}"></audio>
        </div>`;
    } else {
      const filename = message.media.filename || 'Fichier';
      const size     = message.media.size ? formatFileSize(message.media.size) : '';
      content = `
        <div class="message-file">
          <a href="${message.media.url}" target="_blank" download="${filename}">
            📄 ${escapeHtml(filename)} ${size ? `(${size})` : ''}
          </a>
        </div>`;
    }
  }

  // Réponse imbriquée
  let replyHTML = '';
  if (message.replyTo && !message.isDeleted) {
    replyHTML = `
      <div class="reply-quote">
        <span>${escapeHtml(message.replyTo.content || '[média]')}</span>
      </div>`;
  }

  // Statut (seulement pour les messages envoyés)
  const statusIcon = isSent ? getStatusIcon(message.status) : '';

  return `
    <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}">
      <div class="message-bubble">
        ${replyHTML}
        ${content}
        <div class="message-time">
          ${time}
          ${statusIcon}
        </div>
      </div>
    </div>
  `;
}

function getStatusIcon(status) {
  if (!status) return '';
  if (status.read)      return '<span class="message-status read">✓✓</span>';
  if (status.delivered) return '<span class="message-status">✓✓</span>';
  return '<span class="message-status">✓</span>';
}

// ─────────────────────────────────────────
// ENVOI DE MESSAGES
// ─────────────────────────────────────────
async function sendMessage() {
  const input   = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content || !currentConversation) return;

  const tempId = `temp_${Date.now()}`;
  const tempMessage = {
    id: tempId, _id: tempId,
    conversation: currentConversation.id,
    sender: currentUser,
    senderId: currentUser.id,
    content,
    type: 'text',
    createdAt: new Date().toISOString(),
    status: { sent: true, delivered: false, read: false }
  };

  messages.push(tempMessage);
  displayMessages();
  scrollToBottom();
  input.value = '';

  if (window.socket) {
    window.socket.emit('typing:stop', { conversationId: currentConversation.id });
    window.socket.emit('message:send', {
      conversationId: currentConversation.id,
      content,
      type: 'text',
      replyTo: replyToMessage ? replyToMessage.id : null,
      tempId
    });
  }

  replyToMessage = null;
  document.getElementById('replyPreview').style.display = 'none';
}

// Limites de taille par type (doit correspondre aux constants backend)
const FILE_SIZE_LIMITS = {
  image:    5  * 1024 * 1024,  // 5 MB
  video:    50 * 1024 * 1024,  // 50 MB
  audio:    10 * 1024 * 1024,  // 10 MB
  document: 20 * 1024 * 1024   // 20 MB
};
const FILE_SIZE_LABELS = { image: '5 MB', video: '50 MB', audio: '10 MB', document: '20 MB' };

function getFileType(mimetype) {
  if (mimetype.startsWith('image/'))  return 'image';
  if (mimetype.startsWith('video/'))  return 'video';
  if (mimetype.startsWith('audio/'))  return 'audio';
  return 'document';
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const fileType = getFileType(file.type);
  const maxSize  = FILE_SIZE_LIMITS[fileType];
  const hint     = document.getElementById('fileSizeHint');

  // Vérification côté client
  if (file.size > maxSize) {
    showToast(`Fichier trop volumineux. Maximum ${FILE_SIZE_LABELS[fileType]} pour les ${fileType}s.`, 'error');
    e.target.value = '';
    return;
  }

  const preview = document.getElementById('filePreview');

  // Afficher la limite
  if (hint) {
    hint.textContent = `Limite : ${FILE_SIZE_LABELS[fileType]} pour les ${fileType}s`;
    hint.style.display = 'block';
  }

  if (fileType === 'image') {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.innerHTML = `
        <div class="file-preview-item">
          <img src="${ev.target.result}" alt="Aperçu">
          <div class="file-preview-actions">
            <span>${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>
            <button class="btn btn-primary btn-sm" onclick="sendMediaFile()">Envoyer 📷</button>
            <button class="btn-cancel" onclick="cancelFilePreview()">✕</button>
          </div>
        </div>`;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else if (fileType === 'video') {
    preview.innerHTML = `
      <div class="file-preview-item">
        <span>🎥 ${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>
        <div class="file-preview-actions">
          <button class="btn btn-primary btn-sm" onclick="sendMediaFile()">Envoyer 🎥</button>
          <button class="btn-cancel" onclick="cancelFilePreview()">✕</button>
        </div>
      </div>`;
    preview.style.display = 'block';
  } else if (fileType === 'audio') {
    preview.innerHTML = `
      <div class="file-preview-item">
        <span>🎵 ${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>
        <div class="file-preview-actions">
          <button class="btn btn-primary btn-sm" onclick="sendMediaFile()">Envoyer 🎵</button>
          <button class="btn-cancel" onclick="cancelFilePreview()">✕</button>
        </div>
      </div>`;
    preview.style.display = 'block';
  } else {
    preview.innerHTML = `
      <div class="file-preview-item">
        <span>📄 ${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>
        <div class="file-preview-actions">
          <button class="btn btn-primary btn-sm" onclick="sendMediaFile()">Envoyer 📎</button>
          <button class="btn-cancel" onclick="cancelFilePreview()">✕</button>
        </div>
      </div>`;
    preview.style.display = 'block';
  }
}

async function sendMediaFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file || !currentConversation) return;

  const sendBtn = document.querySelector('.file-preview-item .btn-primary');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Envoi...'; }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('conversationId', currentConversation.id);
  if (replyToMessage) formData.append('replyTo', replyToMessage.id);

  try {
    const response = await fetch(`${API_URL}/messages/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Erreur lors de l'envoi");
    }

    cancelFilePreview();
    await loadMessages(currentConversation.id);
    scrollToBottom();
  } catch (error) {
    console.error('sendMediaFile:', error);
    showToast('Erreur: ' + error.message, 'error');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Réessayer'; }
  }
}

function cancelFilePreview() {
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('fileInput').value = '';
  const hint = document.getElementById('fileSizeHint');
  if (hint) hint.style.display = 'none';
}

// ─────────────────────────────────────────
// ENREGISTREMENT AUDIO
// ─────────────────────────────────────────
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;
let recordingTimer = null;

async function toggleAudioRecording() {
  if (!currentConversation) {
    showToast('Sélectionnez une conversation d\'abord', 'error');
    return;
  }

  if (!isRecording) {
    await startRecording();
  } else {
    stopRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    isRecording  = true;

    const audioBtn = document.getElementById('audioBtn');
    audioBtn.textContent = '⏹';
    audioBtn.classList.add('recording');

    // Afficher timer
    let secs = 0;
    const preview = document.getElementById('filePreview');
    preview.innerHTML = `<div class="recording-indicator">🔴 Enregistrement... <span id="recordTimer">0:00</span></div>`;
    preview.style.display = 'block';

    recordingTimer = setInterval(() => {
      secs++;
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      const timerEl = document.getElementById('recordTimer');
      if (timerEl) timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    // Choisir le format supporté
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', async () => {
      stream.getTracks().forEach(t => t.stop());
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      await sendAudioBlob(audioBlob, mimeType);
    });
    mediaRecorder.start(250); // chunks de 250ms
  } catch (error) {
    console.error('startRecording:', error);
    showToast('Accès au microphone refusé', 'error');
    isRecording = false;
    document.getElementById('audioBtn').textContent = '🎤';
    document.getElementById('audioBtn').classList.remove('recording');
    document.getElementById('filePreview').style.display = 'none';
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recordingTimer);
  isRecording = false;

  const audioBtn = document.getElementById('audioBtn');
  audioBtn.textContent = '🎤';
  audioBtn.classList.remove('recording');
  document.getElementById('filePreview').style.display = 'none';
}

async function sendAudioBlob(blob, mimeType) {
  if (!currentConversation) return;

  const ext      = mimeType.includes('ogg') ? 'ogg' : 'webm';
  const filename = `audio_${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('conversationId', currentConversation.id);

  try {
    showToast('Envoi du message vocal...', 'info');
    const response = await fetch(`${API_URL}/messages/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erreur envoi audio');
    }

    await loadMessages(currentConversation.id);
    scrollToBottom();
  } catch (error) {
    console.error('sendAudioBlob:', error);
    showToast('Erreur: ' + error.message, 'error');
  }
}

// ─────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────
async function markConversationAsRead(conversationId) {
  try {
    await fetch(`${API_URL}/conversations/${conversationId}/read`, {
      method: 'PUT',
      headers: getHeaders()
    });
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      if (typeof conv.unreadCount === 'object') {
        conv.unreadCount[currentUser.id] = 0;
      } else {
        conv.unreadCount = 0;
      }
      displayConversations();
    }
  } catch (error) {
    console.error('markConversationAsRead:', error);
  }
}

async function searchUsers(query) {
  try {
    const response = await fetch(`${API_URL}/users?search=${encodeURIComponent(query)}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Erreur recherche');
    const data = await response.json();
    displaySearchResults(data.users || []);
  } catch (error) {
    console.error('searchUsers:', error);
  }
}

function displaySearchResults(users) {
  const container = document.getElementById('searchResults');
  if (users.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun utilisateur trouvé</p>';
    container.classList.add('show');
    return;
  }
  container.innerHTML = users.map(user => `
    <div class="search-result-item" onclick="startConversation(${user.id})">
      <img src="${user.avatar || '/images/default-avatar.png'}" alt="${escapeHtml(user.name)}">
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <p style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(user.email)}</p>
      </div>
    </div>
  `).join('');
  container.classList.add('show');
}

function updateUserStatus(user) {
  const statusEl = document.getElementById('chatUserStatus');
  if (user.isOnline) {
    statusEl.textContent = 'En ligne';
    statusEl.className   = 'status-text online';
  } else {
    const lastSeen = user.lastSeen ? `Vu ${formatTime(user.lastSeen)}` : 'Hors ligne';
    statusEl.textContent = lastSeen;
    statusEl.className   = 'status-text';
  }
}

function openMediaModal(url, type) {
  const modal   = document.getElementById('mediaModal');
  const content = document.getElementById('mediaModalContent');

  if (type === 'image') {
    content.innerHTML = `<img src="${url}" alt="Image">`;
  } else if (type === 'video') {
    content.innerHTML = `<video controls autoplay src="${url}"></video>`;
  }

  modal.style.display = 'flex';
  modal.querySelector('.modal-close').onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function getMessagePreview(message) {
  if (!message) return '';
  if (message.type === 'text') return (message.content || '').substring(0, 50);
  const icons = { image: '📷 Photo', video: '🎥 Vidéo', audio: '🎤 Message vocal', document: '📄 Document' };
  return icons[message.type] || 'Message';
}

function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now  = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Hier';
  if (days < 7)  return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className   = `toast toast-${type} show`;
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────
// EXPOSER LES FONCTIONS GLOBALES
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

window.selectConversation  = selectConversation;
window.startConversation   = startConversation;
window.sendMediaFile       = sendMediaFile;
window.cancelFilePreview   = cancelFilePreview;
window.openMediaModal      = openMediaModal;
window.currentConversation = null; // mis à jour dynamiquement
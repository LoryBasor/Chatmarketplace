// public/js/notifications.js — Notifications in-app + navigateur

class NotificationManager {
  constructor() {
    this.permission = typeof Notification !== 'undefined'
      ? Notification.permission
      : 'denied';
    this._init();
  }

  async _init() {
    if (typeof Notification === 'undefined') return;

    if (this.permission === 'default') {
      // Demander après un délai non-intrusif
      setTimeout(() => this.requestPermission(), 4000);
    }

    // Service Worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (e) {
        // Silencieux si SW non disponible
      }
    }
  }

  async requestPermission() {
    if (typeof Notification === 'undefined') return false;
    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (e) {
      return false;
    }
  }

  // ── Notification navigateur (si permis et fenêtre non focus) ──
  _showBrowserNotif(title, body, conversationId) {
    if (this.permission !== 'granted') return;
    if (document.hasFocus()) return;

    try {
      const n = new Notification(title, {
        body,
        icon:  '/images/logo.png',
        tag:   `conv-${conversationId}`,
        silent: false
      });
      setTimeout(() => n.close(), 5000);
      n.onclick = () => {
        window.focus();
        if (window.selectConversation) window.selectConversation(conversationId);
        n.close();
      };
    } catch (e) { /* ignore */ }
  }

  // ── Notification in-app (toujours affichée si page en focus ou pas de permission) ──
  _showInAppNotif(senderName, messageText, conversationId, avatarUrl) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const id  = `notif-${Date.now()}`;
    const div = document.createElement('div');
    div.className  = 'in-app-notif';
    div.id         = id;
    div.innerHTML  = `
      <img class="notif-avatar"
           src="${avatarUrl || '/images/default-avatar.png'}"
           onerror="this.src='/images/default-avatar.png'"
           alt="">
      <div class="notif-body">
        <div class="notif-name">${this._esc(senderName)}</div>
        <div class="notif-text">${this._esc(messageText)}</div>
      </div>
      <button class="notif-close" onclick="document.getElementById('${id}').remove()">✕</button>
    `;

    // Clic sur la notif → ouvrir la conversation
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('notif-close')) return;
      if (window.selectConversation) window.selectConversation(conversationId);
      div.remove();
    });

    container.appendChild(div);

    // Auto-fermeture après 5s
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transition = 'opacity .3s';
      setTimeout(() => div.remove(), 350);
    }, 5000);
  }

  // ── Point d'entrée principal ──────────────────────────────
  showMessage(senderName, messageText, conversationId, avatarUrl) {
    // 1) Notification navigateur si permission accordée + fenêtre pas focus
    this._showBrowserNotif(senderName, messageText, conversationId);

    // 2) Notification in-app TOUJOURS (sauf si on est dans la conversation)
    const isCurrent = window.currentConversation &&
      String(window.currentConversation.id) === String(conversationId);

    if (!isCurrent) {
      this._showInAppNotif(senderName, messageText, conversationId, avatarUrl);
    }

    // 3) Petit son
    this._playBeep();
  }

  // Son synthétique via Web Audio API (pas de fichier à télécharger)
  _playBeep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) { /* ignore */ }
  }

  _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

window.notificationManager = new NotificationManager();

// ── Marquer comme lu quand la page redevient visible ─────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.currentConversation && window.socket) {
    window.socket.emit('message:read', {
      conversationId: window.currentConversation.id
    });
  }
});

window.addEventListener('focus', () => {
  if (window.currentConversation && window.socket) {
    window.socket.emit('message:read', {
      conversationId: window.currentConversation.id
    });
  }
});
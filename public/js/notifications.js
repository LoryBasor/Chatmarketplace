// public/js/notifications.js - Gestion des notifications

class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.init();
  }

  async init() {
    // Vérifier le support des notifications
    if (!('Notification' in window)) {
      console.warn('Ce navigateur ne supporte pas les notifications');
      return;
    }

    this.permission = Notification.permission;

    // Demander la permission automatiquement
    if (this.permission === 'default') {
      await this.requestPermission();
    }

    // Enregistrer le Service Worker si supporté
    if ('serviceWorker' in navigator) {
      this.registerServiceWorker();
    }
  }

  async requestPermission() {
    try {
      this.permission = await Notification.requestPermission();
      console.log('Permission de notification:', this.permission);
      return this.permission === 'granted';
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      return false;
    }
  }

  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker enregistré:', registration);

      // Gérer les mises à jour
      registration.addEventListener('updatefound', () => {
        console.log('Mise à jour du Service Worker détectée');
      });
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du Service Worker:', error);
    }
  }

  show(title, options = {}) {
    if (this.permission !== 'granted') {
      console.warn('Permission de notification refusée');
      return null;
    }

    const defaultOptions = {
      icon: '/images/logo.png',
      badge: '/images/badge.png',
      vibrate: [200, 100, 200],
      tag: 'instantchat-message',
      requireInteraction: false,
      silent: false
    };

    const notification = new Notification(title, {
      ...defaultOptions,
      ...options
    });

    // Auto-fermeture après 5 secondes
    setTimeout(() => notification.close(), 5000);

    return notification;
  }

  showMessage(sender, message, conversationId) {
    const notification = this.show(sender, {
      body: message,
      tag: `conversation-${conversationId}`,
      data: { conversationId }
    });

    if (notification) {
      notification.onclick = () => {
        window.focus();
        if (window.selectConversation) {
          window.selectConversation(conversationId);
        }
        notification.close();
      };
    }

    return notification;
  }

  playSound(soundType = 'message') {
    // Vérifier si les sons sont activés
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.settings?.soundEnabled) return;

    const sounds = {
      message: '/sounds/message.mp3',
      sent: '/sounds/sent.mp3',
      notification: '/sounds/notification.mp3'
    };

    const audio = new Audio(sounds[soundType] || sounds.message);
    audio.volume = 0.5;
    audio.play().catch(err => console.log('Erreur lecture son:', err));
  }
}

// Créer une instance globale
window.notificationManager = new NotificationManager();

// Service Worker code (à mettre dans public/sw.js)
const serviceWorkerCode = `
// public/sw.js - Service Worker pour les notifications push

const CACHE_NAME = 'instantchat-v1';
const urlsToCache = [
  '/',
  '/chat',
  '/css/style.css',
  '/js/app.js',
  '/js/socket.js',
  '/js/notifications.js',
  '/images/logo.png'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interception des requêtes réseau
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retourner la réponse
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Gestion des notifications push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Nouveau message',
    icon: data.icon || '/images/logo.png',
    badge: '/images/badge.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'instantchat-message',
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'InstantChat', options)
  );
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenêtre est déjà ouverte, la focus
        for (let client of clientList) {
          if (client.url.includes('/chat') && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Sinon, ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow('/chat');
        }
      })
  );
});

// Synchronisation en arrière-plan
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Logique de synchronisation des messages
  console.log('Synchronisation des messages...');
}
`;

// Créer le fichier Service Worker
console.log('Service Worker code ready. Save to public/sw.js:');
console.log(serviceWorkerCode);

// Gérer la visibilité de la page pour les notifications
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // La page est visible, marquer les messages comme lus
    if (window.currentConversation && window.socket) {
      window.socket.emit('message:read', {
        conversationId: window.currentConversation._id
      });
    }
  }
});

// Gérer le focus de la fenêtre
window.addEventListener('focus', () => {
  // Marquer automatiquement les messages comme lus
  if (window.currentConversation && window.socket) {
    window.socket.emit('message:read', {
      conversationId: window.currentConversation._id
    });
  }
});

// Désactiver les notifications quand la page est visible
window.addEventListener('blur', () => {
  // La page n'est plus visible
});

// Demander la permission au chargement (avec un délai pour ne pas être intrusif)
setTimeout(() => {
  if (localStorage.getItem('token')) {
    window.notificationManager.requestPermission();
  }
}, 3000);
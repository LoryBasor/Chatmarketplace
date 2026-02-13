// src/utils/constants.js
// Constantes globales de l'application

module.exports = {
  // Limites de fichiers
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  MAX_MESSAGE_LENGTH: 5000,
  MAX_STATUS_LENGTH: 150,
  MAX_NAME_LENGTH: 100,
  
  // Rétention des fichiers
  FILE_RETENTION_DAYS: parseInt(process.env.FILE_RETENTION_DAYS) || 30,
  
  // Types de fichiers autorisés
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  
  ALLOWED_VIDEO_TYPES: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
  ],
  
  ALLOWED_AUDIO_TYPES: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/m4a'
  ],
  
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed'
  ],
  
  // Types de messages
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    DOCUMENT: 'document',
    SYSTEM: 'system'
  },
  
  // Types de conversations
  CONVERSATION_TYPES: {
    INDIVIDUAL: 'individual',
    GROUP: 'group',
    SUPPORT: 'support',
    ORDER: 'order'
  },
  
  // Statuts de message
  MESSAGE_STATUS: {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read'
  },
  
  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  
  // JWT
  JWT_EXPIRY: process.env.JWT_EXPIRE || '7d',
  
  // Événements Socket.IO
  SOCKET_EVENTS: {
    // Messages
    MESSAGE_SEND: 'message:send',
    MESSAGE_NEW: 'message:new',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_DELIVERED: 'message:delivered',
    MESSAGE_READ: 'message:read',
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    MESSAGES_READ: 'messages:read',
    
    // Typing
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
    TYPING_USER: 'typing:user',
    
    // Utilisateurs
    USER_ONLINE: 'user:online',
    USER_OFFLINE: 'user:offline',
    
    // Conversations
    CONVERSATION_JOIN: 'conversation:join',
    CONVERSATION_LEAVE: 'conversation:leave',
    
    // Système
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ERROR: 'error'
  },
  
  // Codes d'erreur HTTP
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500
  },
  
  // Messages d'erreur
  ERROR_MESSAGES: {
    INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
    EMAIL_EXISTS: 'Cet email est déjà utilisé',
    USER_NOT_FOUND: 'Utilisateur non trouvé',
    CONVERSATION_NOT_FOUND: 'Conversation non trouvée',
    MESSAGE_NOT_FOUND: 'Message non trouvé',
    UNAUTHORIZED: 'Non autorisé',
    FORBIDDEN: 'Accès refusé',
    INVALID_TOKEN: 'Token invalide ou expiré',
    FILE_TOO_LARGE: 'Fichier trop volumineux',
    INVALID_FILE_TYPE: 'Type de fichier non autorisé',
    VALIDATION_ERROR: 'Erreur de validation',
    SERVER_ERROR: 'Erreur serveur interne'
  },
  
  // Chemins de fichiers
  UPLOAD_PATHS: {
    IMAGES: 'images',
    VIDEOS: 'videos',
    AUDIO: 'audio',
    DOCUMENTS: 'files',
    AVATARS: 'avatars'
  },
  
  // Images par défaut
  DEFAULT_AVATAR: 'default-avatar.png',
  DEFAULT_GROUP_AVATAR: 'default-group.png'
};

// src/utils/helpers.js
// Fonctions utilitaires réutilisables

const crypto = require('crypto');
const path = require('path');

/**
 * Générer un nom de fichier unique
 * @param {string} originalName - Nom original du fichier
 * @returns {string} Nom de fichier unique
 */
exports.generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  const basename = path.basename(originalName, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 20);
  
  return `${basename}-${timestamp}-${randomString}${extension}`;
};

/**
 * Formater la taille d'un fichier
 * @param {number} bytes - Taille en octets
 * @returns {string} Taille formatée
 */
exports.formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Valider un email
 * @param {string} email - Adresse email
 * @returns {boolean} Valide ou non
 */
exports.isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valider un mot de passe
 * @param {string} password - Mot de passe
 * @returns {object} Résultat de validation
 */
exports.validatePassword = (password) => {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const isValid = password.length >= minLength;
  
  return {
    isValid,
    minLength: password.length >= minLength,
    hasUpperCase,
    hasLowerCase,
    hasNumbers,
    hasSpecialChar,
    strength: isValid ? 
      (hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar ? 'strong' : 'medium') : 
      'weak'
  };
};

/**
 * Sanitize HTML pour éviter XSS
 * @param {string} text - Texte à nettoyer
 * @returns {string} Texte nettoyé
 */
exports.sanitizeHTML = (text) => {
  if (!text) return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
};

/**
 * Tronquer un texte
 * @param {string} text - Texte
 * @param {number} maxLength - Longueur maximale
 * @returns {string} Texte tronqué
 */
exports.truncate = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Formater une date en temps relatif
 * @param {Date|string} date - Date à formater
 * @returns {string} Temps relatif (ex: "il y a 2 heures")
 */
exports.timeAgo = (date) => {
  const now = new Date();
  const past = new Date(date);
  const diff = now - past;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (seconds < 60) return 'À l\'instant';
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
};

/**
 * Générer un slug à partir d'un texte
 * @param {string} text - Texte
 * @returns {string} Slug
 */
exports.slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Pagination helper
 * @param {number} page - Numéro de page
 * @param {number} limit - Nombre d'éléments par page
 * @returns {object} Skip et limit pour MongoDB
 */
exports.getPagination = (page = 1, limit = 50) => {
  const validPage = Math.max(1, parseInt(page));
  const validLimit = Math.min(100, Math.max(1, parseInt(limit)));
  
  return {
    skip: (validPage - 1) * validLimit,
    limit: validLimit,
    page: validPage
  };
};

/**
 * Formater une réponse d'erreur
 * @param {string} message - Message d'erreur
 * @param {Array} details - Détails supplémentaires
 * @returns {object} Objet d'erreur formaté
 */
exports.formatError = (message, details = []) => {
  return {
    success: false,
    error: message,
    details: details.length > 0 ? details : undefined
  };
};

/**
 * Formater une réponse de succès
 * @param {string} message - Message de succès
 * @param {object} data - Données
 * @returns {object} Objet de succès formaté
 */
exports.formatSuccess = (message, data = null) => {
  return {
    success: true,
    message,
    data
  };
};

/**
 * Vérifier si un utilisateur est en ligne
 * @param {Date} lastSeen - Dernière connexion
 * @param {number} threshold - Seuil en minutes
 * @returns {boolean} En ligne ou non
 */
exports.isUserOnline = (lastSeen, threshold = 5) => {
  if (!lastSeen) return false;
  
  const now = new Date();
  const last = new Date(lastSeen);
  const diff = (now - last) / 1000 / 60; // en minutes
  
  return diff <= threshold;
};

/**
 * Générer un token aléatoire
 * @param {number} length - Longueur du token
 * @returns {string} Token
 */
exports.generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash un texte avec SHA256
 * @param {string} text - Texte à hasher
 * @returns {string} Hash
 */
exports.hashText = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Détecter le type de fichier à partir du MIME type
 * @param {string} mimeType - Type MIME
 * @returns {string} Type de fichier (image, video, audio, document)
 */
exports.detectFileType = (mimeType) => {
  const { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES } = require('./constants');
  
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  return 'document';
};

/**
 * Extraire l'extension d'un fichier
 * @param {string} filename - Nom du fichier
 * @returns {string} Extension
 */
exports.getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase().replace('.', '');
};

/**
 * Valider un ObjectId MongoDB
 * @param {string} id - ID à valider
 * @returns {boolean} Valide ou non
 */
exports.isValidObjectId = (id) => {
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;
  return objectIdPattern.test(id);
};

/**
 * Convertir une durée en secondes vers un format lisible
 * @param {number} seconds - Durée en secondes
 * @returns {string} Durée formatée (ex: "2:35")
 */
exports.formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Nettoyer un objet de ses propriétés undefined/null
 * @param {object} obj - Objet à nettoyer
 * @returns {object} Objet nettoyé
 */
exports.cleanObject = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null)
  );
};

/**
 * Grouper des éléments par clé
 * @param {Array} array - Tableau d'objets
 * @param {string} key - Clé de groupement
 * @returns {object} Objets groupés
 */
exports.groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
};

/**
 * Attendre un certain temps (Promise)
 * @param {number} ms - Millisecondes
 * @returns {Promise} Promise qui se résout après le délai
 */
exports.sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry une fonction avec backoff exponentiel
 * @param {Function} fn - Fonction à exécuter
 * @param {number} maxRetries - Nombre max de tentatives
 * @param {number} delay - Délai initial en ms
 * @returns {Promise} Résultat de la fonction
 */
exports.retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await exports.sleep(delay * Math.pow(2, i));
    }
  }
};

/**
 * Masquer une partie d'un email
 * @param {string} email - Email
 * @returns {string} Email masqué
 */
exports.maskEmail = (email) => {
  if (!email) return '';
  
  const [local, domain] = email.split('@');
  if (!domain) return email;
  
  const maskedLocal = local.length > 2 
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : local;
  
  return `${maskedLocal}@${domain}`;
};

/**
 * Calculer le pourcentage
 * @param {number} part - Partie
 * @param {number} total - Total
 * @param {number} decimals - Nombre de décimales
 * @returns {number} Pourcentage
 */
exports.calculatePercentage = (part, total, decimals = 2) => {
  if (total === 0) return 0;
  return parseFloat(((part / total) * 100).toFixed(decimals));
};

module.exports = exports;
// src/middlewares/errorHandler.js
const multer = require('multer');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');

/**
 * Middleware global de gestion d'erreurs
 * Doit être le dernier middleware de l'application
 */
const errorHandler = (err, req, res, next) => {
  // Logger l'erreur en développement
  if (process.env.NODE_ENV === 'development') {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('🔴 ERROR CAUGHT BY HANDLER:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Name:', err.name);
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    // Logger simplement en production
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
  }

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      details: errors
    });
  }

  // Erreur de cast MongoDB (ID invalide)
  if (err.name === 'CastError') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'ID invalide',
      message: `Le champ ${err.path} contient une valeur invalide`,
      value: err.value
    });
  }

  // Erreur de duplication (email unique, etc.)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const value = err.keyValue[field];
    
    return res.status(HTTP_STATUS.CONFLICT).json({
      error: `${field} déjà utilisé`,
      message: `La valeur '${value}' est déjà utilisée pour le champ ${field}`,
      field,
      value
    });
  }

  // Erreur Multer (upload)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.FILE_TOO_LARGE,
        maxSize: process.env.MAX_FILE_SIZE 
          ? `${parseInt(process.env.MAX_FILE_SIZE) / 1024 / 1024}MB` 
          : '10MB'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Fichier inattendu',
        message: 'Le champ de fichier fourni n\'est pas accepté'
      });
    }
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Erreur lors de l\'upload du fichier',
      message: err.message,
      code: err.code
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MESSAGES.INVALID_TOKEN,
      message: 'Le token fourni est invalide'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Token expiré',
      message: 'Votre session a expiré, veuillez vous reconnecter',
      expiredAt: err.expiredAt
    });
  }

  // Erreur MongoDB de connexion
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Erreur de connexion à la base de données',
      message: 'Impossible de se connecter à la base de données. Veuillez réessayer.'
    });
  }

  // Erreur personnalisée avec status
  if (err.status || err.statusCode) {
    return res.status(err.status || err.statusCode).json({
      error: err.message || ERROR_MESSAGES.SERVER_ERROR,
      ...(err.details && { details: err.details })
    });
  }

  // Erreur générique
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  
  res.status(statusCode).json({
    error: err.message || ERROR_MESSAGES.SERVER_ERROR,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      name: err.name
    })
  });
};

/**
 * Middleware pour gérer les routes non trouvées (404)
 */
const notFound = (req, res, next) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Route non trouvée',
    message: `La route ${req.method} ${req.originalUrl} n'existe pas`,
    availableRoutes: {
      auth: '/api/auth/*',
      users: '/api/users/*',
      conversations: '/api/conversations/*',
      messages: '/api/messages/*'
    }
  });
};

/**
 * Créer une erreur personnalisée
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrapper async pour les routes
 * Évite d'avoir à mettre try/catch partout
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = errorHandler;
module.exports.notFound = notFound;
module.exports.AppError = AppError;
module.exports.asyncHandler = asyncHandler;
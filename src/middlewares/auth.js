// src/middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');

/**
 * Middleware d'authentification JWT
 * Vérifie la validité du token et ajoute userId et user à req
 */
const auth = async (req, res, next) => {
  try {
    // Récupérer le token depuis les headers
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Token manquant. Format attendu: Bearer <token>'
      });
    }

    const token = authHeader.split(' ')[1];

    // Vérifier le token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
          error: ERROR_MESSAGES.INVALID_TOKEN 
        });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
          error: 'Token expiré',
          expiredAt: error.expiredAt
        });
      }
      throw error;
    }
    
    // Vérifier que l'utilisateur existe toujours
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        error: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }
    
    // Ajouter l'userId et user à la requête
    req.userId = decoded.userId;
    req.user = user;
    
    next();
  } catch (error) {
    console.error('Erreur middleware auth:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      error: ERROR_MESSAGES.SERVER_ERROR 
    });
  }
};

/**
 * Middleware optionnel - n'échoue pas si pas de token
 * Utile pour les routes accessibles avec ou sans authentification
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user) {
        req.userId = decoded.userId;
        req.user = user;
      }
    } catch (error) {
      // Ignorer les erreurs de token en mode optionnel
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = auth;
module.exports.optionalAuth = optionalAuth;
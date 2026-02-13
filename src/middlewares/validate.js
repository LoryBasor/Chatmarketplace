// src/middlewares/validate.js
const { validationResult } = require('express-validator');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');

/**
 * Middleware de validation Express Validator
 * Vérifie les erreurs de validation et retourne une réponse formatée
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Formater les erreurs
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      details: formattedErrors
    });
  }
  
  next();
};

/**
 * Middleware de validation personnalisé
 * Permet de créer des validations custom
 */
const customValidate = (validationFn) => {
  return async (req, res, next) => {
    try {
      const result = await validationFn(req);
      
      if (result.isValid) {
        next();
      } else {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: ERROR_MESSAGES.VALIDATION_ERROR,
          message: result.message,
          details: result.errors
        });
      }
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware pour valider les IDs MongoDB
 */
const { isValidObjectId } = require('../utils/helpers');

const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!isValidObjectId(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'ID invalide',
        message: `Le paramètre ${paramName} doit être un ObjectId MongoDB valide`
      });
    }
    
    next();
  };
};

/**
 * Middleware pour sanitizer les entrées
 */
const sanitizeInput = (req, res, next) => {
  // Supprimer les espaces inutiles des strings
  const sanitize = (obj) => {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    });
  };
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  
  next();
};

module.exports = validate;
module.exports.customValidate = customValidate;
module.exports.validateObjectId = validateObjectId;
module.exports.sanitizeInput = sanitizeInput;

// src/middlewares/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
  MAX_FILE_SIZE, 
  ALLOWED_IMAGE_TYPES, 
  ALLOWED_VIDEO_TYPES, 
  ALLOWED_AUDIO_TYPES, 
  ALLOWED_DOCUMENT_TYPES,
  UPLOAD_PATHS,
  HTTP_STATUS,
  ERROR_MESSAGES
} = require('../utils/constants');
const { generateUniqueFilename, detectFileType } = require('../utils/helpers');

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Détecter le type de fichier
    const fileType = detectFileType(file.mimetype);
    
    // Mapper le type vers le dossier
    const folderMap = {
      'image': UPLOAD_PATHS.IMAGES,
      'video': UPLOAD_PATHS.VIDEOS,
      'audio': UPLOAD_PATHS.AUDIO,
      'document': UPLOAD_PATHS.DOCUMENTS
    };
    
    const folder = folderMap[fileType] || UPLOAD_PATHS.DOCUMENTS;
    const uploadPath = path.join(__dirname, '../../public/uploads', folder);
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  
  filename: (req, file, cb) => {
    // Générer un nom unique
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  }
});

// Filtrage des fichiers
const fileFilter = (req, file, cb) => {
  // Liste de tous les types autorisés
  const allowedTypes = [
    ...ALLOWED_IMAGE_TYPES,
    ...ALLOWED_VIDEO_TYPES,
    ...ALLOWED_AUDIO_TYPES,
    ...ALLOWED_DOCUMENT_TYPES
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Types acceptés: images, vidéos, audio, documents PDF/Word/Excel`), false);
  }
};

// Configuration Multer principale
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE, // Taille max du fichier
    files: 1, // Un seul fichier à la fois
    fieldSize: 2 * 1024 * 1024 // 2MB pour les champs texte
  }
});

// Middleware pour upload d'avatar
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '../../public/uploads', UPLOAD_PATHS.AVATARS);
      
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = generateUniqueFilename(file.originalname);
      cb(null, uniqueName);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées pour les avatars'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max pour les avatars
  }
});

// Middleware de gestion d'erreur Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erreurs Multer spécifiques
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.FILE_TOO_LARGE,
        maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Trop de fichiers. Maximum 1 fichier à la fois.'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Champ de fichier inattendu'
      });
    }
    
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Erreur lors de l\'upload du fichier',
      details: err.message
    });
  }
  
  if (err) {
    // Autres erreurs (fileFilter, etc.)
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: err.message || ERROR_MESSAGES.INVALID_FILE_TYPE
    });
  }
  
  next();
};

// Middleware pour valider qu'un fichier a été uploadé
const requireFile = (req, res, next) => {
  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Aucun fichier fourni'
    });
  }
  next();
};

// Middleware pour ajouter des métadonnées sur le fichier
const addFileMetadata = (req, res, next) => {
  if (req.file) {
    const fileType = detectFileType(req.file.mimetype);
    
    req.fileMetadata = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      type: fileType,
      path: req.file.path,
      url: `/uploads/${fileType === 'image' ? UPLOAD_PATHS.IMAGES : 
                      fileType === 'video' ? UPLOAD_PATHS.VIDEOS : 
                      fileType === 'audio' ? UPLOAD_PATHS.AUDIO : 
                      UPLOAD_PATHS.DOCUMENTS}/${req.file.filename}`
    };
  }
  next();
};

module.exports = upload;
module.exports.single = upload.single.bind(upload);
module.exports.uploadAvatar = uploadAvatar;
module.exports.handleMulterError = handleMulterError;
module.exports.requireFile = requireFile;
module.exports.addFileMetadata = addFileMetadata;

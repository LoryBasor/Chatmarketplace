// src/middlewares/upload.js — Cloudinary + limites par type
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const {
  MAX_FILE_SIZE,
  FILE_SIZE_LIMITS,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  HTTP_STATUS,
  ERROR_MESSAGES
} = require('../utils/constants');
const { detectFileType } = require('../utils/helpers');

// Dossier Cloudinary selon le type MIME
function getCloudinaryFolder(mimetype) {
  if (ALLOWED_IMAGE_TYPES.includes(mimetype))    return 'instantchat/images';
  if (ALLOWED_VIDEO_TYPES.includes(mimetype))    return 'instantchat/videos';
  if (ALLOWED_AUDIO_TYPES.includes(mimetype))    return 'instantchat/audio';
  return 'instantchat/documents';
}

// resource_type Cloudinary
function getResourceType(mimetype) {
  if (ALLOWED_VIDEO_TYPES.includes(mimetype)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(mimetype)) return 'video'; // audio via resource_type=video
  return 'auto';
}

// Taille max selon le type MIME
function getMaxSizeForType(mimetype) {
  const type = detectFileType(mimetype);
  return FILE_SIZE_LIMITS[type] || MAX_FILE_SIZE;
}

// ── Storage Cloudinary ──────────────────────────────────────────
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        getCloudinaryFolder(file.mimetype),
    resource_type: getResourceType(file.mimetype),
    allowed_formats: [
      'jpg','jpeg','png','gif','webp','svg',
      'mp4','webm','ogg','mov',
      'mp3','wav','aac','m4a','opus','oga',
      'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip'
    ]
  })
});

// ── Filtre de types autorisés + limite par type ─────────────────
const fileFilter = (req, file, cb) => {
  const allAllowed = [
    ...ALLOWED_IMAGE_TYPES,
    ...ALLOWED_VIDEO_TYPES,
    ...ALLOWED_AUDIO_TYPES,
    ...ALLOWED_DOCUMENT_TYPES
  ];

  if (!allAllowed.includes(file.mimetype)) {
    return cb(new Error(`Type de fichier non autorisé : ${file.mimetype}`), false);
  }

  // Vérification de la taille AVANT upload (Content-Length header)
  const maxSize  = getMaxSizeForType(file.mimetype);
  const fileType = detectFileType(file.mimetype);
  const reported = parseInt(req.headers['content-length'] || '0');

  // (Note: Content-Length inclut aussi les données multipart — on ne bloque pas ici,
  //  on vérifie après dans limits.fileSize via Multer)

  // Stocker le max pour ce fichier dans la requête
  req._maxFileSize = maxSize;
  req._fileType    = fileType;

  cb(null, true);
};

// ── Upload principal ────────────────────────────────────────────
const upload = multer({
  storage: cloudinaryStorage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE, // garde-fou absolu (50MB)
    files: 1
  }
});

// ── Middleware de validation APRÈS upload (taille réelle) ───────
const validateFileSize = (req, res, next) => {
  if (!req.file) return next();

  const maxSize  = getMaxSizeForType(req.file.mimetype);
  const fileType = detectFileType(req.file.mimetype);
  const sizeMB   = (maxSize / 1024 / 1024).toFixed(0);

  if (req.file.size && req.file.size > maxSize) {
    // Supprimer le fichier uploadé sur Cloudinary
    const publicId = req.file.filename || req.file.public_id;
    if (publicId) {
      cloudinary.uploader.destroy(publicId, { resource_type: getResourceType(req.file.mimetype) })
        .catch(() => {});
    }
    return res.status(413).json({
      error: `Fichier trop volumineux. Maximum ${sizeMB} MB pour les ${fileType}s.`,
      maxSizeMB: parseInt(sizeMB),
      fileType
    });
  }
  next();
};

// ── Avatar (Cloudinary) ─────────────────────────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:        'instantchat/avatars',
    resource_type: 'image',
    allowed_formats: ['jpg','jpeg','png','gif','webp']
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images sont autorisées pour les avatars'), false);
  },
  limits: { fileSize: FILE_SIZE_LIMITS.image }
});

// ── Gestion d'erreur Multer ─────────────────────────────────────
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const sizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      return res.status(413).json({
        error: `Fichier trop volumineux. Maximum ${sizeMB} MB.`
      });
    }
    return res.status(400).json({
      error: "Erreur lors de l'upload",
      details: err.message
    });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

const requireFile = (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
  next();
};

module.exports = upload;
module.exports.single = upload.single.bind(upload);
module.exports.uploadAvatar    = uploadAvatar;
module.exports.handleMulterError = handleMulterError;
module.exports.requireFile     = requireFile;
module.exports.validateFileSize = validateFileSize;
module.exports.getMaxSizeForType = getMaxSizeForType;

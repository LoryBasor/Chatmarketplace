// server.js - Point d'entrée principal de l'application
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Importations locales
const connectDB = require('./src/config/database');
const { initSocket } = require('./src/config/socket');
const errorHandler = require('./src/middlewares/errorHandler');
const { notFound } = require('./src/middlewares/errorHandler');
const { sanitizeInput } = require('./src/middlewares/validate');
const fileCleanupService = require('./src/services/fileCleanupService');

// Routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const conversationRoutes = require('./src/routes/conversations');
const messageRoutes = require('./src/routes/messages');

// Initialisation de l'application
const app = express();
const server = http.createServer(app);

// Connexion à la base de données
connectDB();
/*
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"]
    },
  })
);
*/

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Compression des réponses
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitization des entrées
app.use(sanitizeInput);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limite de 100 requêtes par fenêtre
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
});
app.use('/api/', limiter);

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Routes pour les vues
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use(notFound);

// Gestionnaire d'erreurs global
app.use(errorHandler);

// Initialisation de Socket.IO
const io = initSocket(server);

// Nettoyage automatique des fichiers anciens
fileCleanupService.startCleanupSchedule();

// Gestion des erreurs non gérées
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
  if (process.env.NODE_ENV === 'production') {
    // En production, logger et continuer
    console.error('Arrêt du serveur...');
    server.close(() => process.exit(1));
  }
});

process.on('uncaughtException', (err) => {
  console.error('Exception non capturée:', err);
  process.exit(1);
});

// Arrêt gracieux
process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arrêt gracieux...');
  server.close(() => {
    console.log('Serveur fermé');
    process.exit(0);
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   InstantChat Server Started 🚀       ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                        
║  Environment: ${process.env.NODE_ENV || 'development'}
║  MongoDB: Connected                    ║
║  Socket.IO: Initialized                ║
╚════════════════════════════════════════╝
  `);
});

// Export pour intégration en tant que module
module.exports = { app, server, io };
// src/services/fileCleanupService.js
const fs = require('fs');
const path = require('path');
const Message = require('../models/Message');

class FileCleanupService {
  // Nettoyer les fichiers anciens
  static async cleanOldFiles() {
    try {
      const retentionDays = parseInt(process.env.FILE_RETENTION_DAYS) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      console.log(`🧹 Nettoyage des fichiers antérieurs à ${cutoffDate.toISOString()}`);

      // Trouver les messages avec médias anciens
      const oldMessages = await Message.find({
        type: { $in: ['image', 'video', 'document', 'audio'] },
        createdAt: { $lt: cutoffDate },
        'media.url': { $exists: true }
      });

      let deletedCount = 0;

      for (const message of oldMessages) {
        if (message.media && message.media.filename) {
          const filePath = path.join(
            __dirname,
            '../../public/uploads',
            this.getFileFolder(message.type),
            message.media.filename
          );

          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedCount++;
              console.log(`✅ Supprimé: ${filePath}`);
            }
          } catch (err) {
            console.error(`❌ Erreur suppression ${filePath}:`, err.message);
          }
        }
      }

      console.log(`✅ Nettoyage terminé: ${deletedCount} fichiers supprimés`);
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
    }
  }

  static getFileFolder(type) {
    switch (type) {
      case 'image': return 'images';
      case 'video': return 'videos';
      case 'audio': return 'audio';
      default: return 'files';
    }
  }

  // Démarrer le nettoyage automatique (tous les jours à 2h du matin)
  static startCleanupSchedule() {
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 heures

    // Première exécution immédiate si nécessaire
    // this.cleanOldFiles();

    // Puis toutes les 24h
    setInterval(() => {
      this.cleanOldFiles();
    }, CLEANUP_INTERVAL);

    console.log('📅 Service de nettoyage automatique démarré');
  }
}

module.exports = FileCleanupService;
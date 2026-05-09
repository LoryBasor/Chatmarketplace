// src/services/fileCleanupService.js
const { getPool } = require('../config/database');
const cloudinary  = require('../config/cloudinary');

class FileCleanupService {
  /**
   * Nettoyer les fichiers expirés sur Cloudinary et mettre à jour la base de données
   */
  static async cleanOldFiles() {
    try {
      const pool = getPool();
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      console.log(`🧹 [${new Date().toISOString()}] Démarrage du nettoyage des médias expirés...`);

      // Trouver les messages expirés qui ne sont pas encore marqués comme supprimés
      const [oldMessages] = await pool.query(
        `SELECT id, media_url, media_filename, media_mime_type 
         FROM messages 
         WHERE media_expires_at <= ? 
           AND media_expired = 0 
           AND media_url IS NOT NULL`,
        [now]
      );

      if (!oldMessages || oldMessages.length === 0) {
        console.log('✅ Aucun fichier expiré à nettoyer.');
        return;
      }

      console.log(`🧹 ${oldMessages.length} fichiers expirés détectés. Suppression en cours...`);

      let deletedCount = 0;

      for (const msg of oldMessages) {
        // Le public_id de Cloudinary a été stocké dans media_filename par le multer-storage-cloudinary
        // S'il n'y est pas, on essaie d'extraire depuis l'URL
        let publicId = msg.media_filename;

        if (publicId) {
          try {
            // Déterminer le resource_type (video pour les vidéos/audios, image pour le reste par défaut)
            let resType = 'auto';
            if (msg.media_mime_type) {
              if (msg.media_mime_type.startsWith('video/') || msg.media_mime_type.startsWith('audio/')) {
                resType = 'video';
              } else if (msg.media_mime_type.startsWith('image/')) {
                resType = 'image';
              } else {
                resType = 'raw';
              }
            }

            // Suppression sur Cloudinary
            await cloudinary.uploader.destroy(publicId, { resource_type: resType });
            
            // Mettre à jour la base de données
            await pool.query(
              'UPDATE messages SET media_expired = 1 WHERE id = ?',
              [msg.id]
            );

            deletedCount++;
            console.log(`✅ [Message ${msg.id}] Média supprimé sur Cloudinary: ${publicId}`);
          } catch (err) {
            console.error(`❌ Erreur suppression Cloudinary [Message ${msg.id}]:`, err.message);
            // On marque quand même comme expiré pour ne pas réessayer en boucle si le fichier est introuvable
            if (err.http_code === 404 || err.message.includes('not found')) {
               await pool.query('UPDATE messages SET media_expired = 1 WHERE id = ?', [msg.id]);
            }
          }
        } else {
          // Si pas de publicId, on marque juste comme expiré
          await pool.query('UPDATE messages SET media_expired = 1 WHERE id = ?', [msg.id]);
        }
      }

      console.log(`✅ Nettoyage terminé: ${deletedCount} fichiers supprimés de Cloudinary.`);
    } catch (error) {
      console.error('❌ Erreur globale lors du nettoyage:', error);
    }
  }

  // Démarrer le nettoyage automatique
  static startCleanupSchedule() {
    // Vérification toutes les heures
    const CLEANUP_INTERVAL = 60 * 60 * 1000; 

    // Première exécution après 10 secondes (pour laisser le serveur démarrer)
    setTimeout(() => {
      this.cleanOldFiles();
    }, 10000);

    // Puis régulièrement
    setInterval(() => {
      this.cleanOldFiles();
    }, CLEANUP_INTERVAL);

    console.log('📅 Service de nettoyage automatique (Cloudinary) démarré (Toutes les heures)');
  }
}

module.exports = FileCleanupService;
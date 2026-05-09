// src/config/database.js
const mysql = require('mysql2/promise');

let pool;

const connectDB = async () => {
  try {
    pool = mysql.createPool({
      host:     process.env.MYSQL_HOST     || 'localhost',
      port:     parseInt(process.env.MYSQL_PORT || '3306'),
      user:     process.env.MYSQL_USER     || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'chatmarketplace',
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      timezone:           '+00:00',
      charset:            'utf8mb4'
    });

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    console.log('✅ MySQL connecté avec succès');
    await initSchema();

  } catch (error) {
    console.error('❌ Erreur de connexion MySQL:', error.message);
    process.exit(1);
  }
};

const initSchema = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      avatar VARCHAR(255) DEFAULT 'default-avatar.png',
      status VARCHAR(150) DEFAULT 'Disponible',
      is_online TINYINT(1) DEFAULT 0,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      socket_id VARCHAR(255) DEFAULT NULL,
      blocked_users JSON DEFAULT (JSON_ARRAY()),
      settings JSON DEFAULT (JSON_OBJECT('notifications', TRUE, 'soundEnabled', TRUE)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('individual','group','support','order') DEFAULT 'individual',
      name VARCHAR(255) DEFAULT NULL,
      avatar VARCHAR(255) DEFAULT NULL,
      last_message_id INT DEFAULT NULL,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active TINYINT(1) DEFAULT 1,
      metadata JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (conversation_id, user_id),
      KEY idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS unread_counts (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      count INT DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Table messages avec media_expires_at pour l'expiration
    `CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      type ENUM('text','image','video','document','audio','system') DEFAULT 'text',
      content TEXT DEFAULT NULL,
      reply_to_id INT DEFAULT NULL,
      is_edited TINYINT(1) DEFAULT 0,
      edited_at DATETIME DEFAULT NULL,
      is_deleted TINYINT(1) DEFAULT 0,
      deleted_at DATETIME DEFAULT NULL,
      status_sent TINYINT(1) DEFAULT 1,
      status_delivered TINYINT(1) DEFAULT 0,
      status_read TINYINT(1) DEFAULT 0,
      media_url VARCHAR(500) DEFAULT NULL,
      media_filename VARCHAR(255) DEFAULT NULL,
      media_mime_type VARCHAR(100) DEFAULT NULL,
      media_size INT DEFAULT NULL,
      media_thumbnail VARCHAR(500) DEFAULT NULL,
      media_duration INT DEFAULT NULL,
      media_expires_at DATETIME DEFAULT NULL,
      media_expired TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_conversation_created (conversation_id, created_at),
      KEY idx_sender_created (sender_id, created_at),
      KEY idx_media_expires (media_expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS message_read_by (
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS message_delivered_to (
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS message_deleted_for (
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];

  for (const query of queries) {
    await pool.query(query);
  }

  // Migration : ajouter media_expires_at et media_expired de manière compatible
  try {
    const [colsExpires] = await pool.query("SHOW COLUMNS FROM messages LIKE 'media_expires_at'");
    if (colsExpires.length === 0) {
      await pool.query("ALTER TABLE messages ADD COLUMN media_expires_at DATETIME DEFAULT NULL");
    }

    const [colsExpired] = await pool.query("SHOW COLUMNS FROM messages LIKE 'media_expired'");
    if (colsExpired.length === 0) {
      await pool.query("ALTER TABLE messages ADD COLUMN media_expired TINYINT(1) DEFAULT 0");
    }
  } catch (e) {
    console.error('❌ Erreur lors de la migration de la table messages:', e.message);
  }

  console.log('✅ Schéma MySQL initialisé');
};

const getPool = () => {
  if (!pool) throw new Error('Base de données non initialisée');
  return pool;
};

module.exports = connectDB;
module.exports.getPool = getPool;
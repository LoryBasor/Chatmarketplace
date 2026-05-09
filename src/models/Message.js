// src/models/Message.js — DAO MySQL (corrigé)
const { getPool } = require('../config/database');

const Message = {

  async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    if (!rows[0]) return null;
    return await Message._hydrate(rows[0]);
  },

  async findOne(criteria = {}) {
    const pool = getPool();
    const conditions = [];
    const values = [];

    if (criteria.id !== undefined)        { conditions.push('id = ?');        values.push(criteria.id); }
    if (criteria.sender_id !== undefined) { conditions.push('sender_id = ?'); values.push(criteria.sender_id); }
    if (criteria.conversation_id !== undefined) { conditions.push('conversation_id = ?'); values.push(criteria.conversation_id); }

    if (conditions.length === 0) return null;
    const [rows] = await pool.query(
      `SELECT * FROM messages WHERE ${conditions.join(' AND ')} LIMIT 1`,
      values
    );
    return rows[0] ? await Message._hydrate(rows[0]) : null;
  },

  async create({ conversation, conversationId, sender, senderId, content, type = 'text', replyTo,
                 media_url, media_filename, media_mime_type, media_size, media_thumbnail, media_duration,
                 media_expires_at }) {
    const pool = getPool();
    const convId = parseInt(conversation || conversationId);
    const sndId  = parseInt(sender || senderId);

    const [result] = await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_id, content, type, reply_to_id,
          media_url, media_filename, media_mime_type, media_size, media_thumbnail, media_duration,
          media_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [convId, sndId, content || null, type, replyTo || null,
       media_url || null, media_filename || null, media_mime_type || null,
       media_size || null, media_thumbnail || null, media_duration || null,
       media_expires_at || null]
    );
    return await Message.findById(result.insertId);
  },

  async findByConversation(conversationId, { limit = 50, before = null, userId = null } = {}) {
    const pool = getPool();
    const conditions = ['m.conversation_id = ?'];
    const values = [conversationId];

    if (before) {
      conditions.push('m.created_at < ?');
      values.push(new Date(before));
    }

    if (userId) {
      conditions.push(`m.id NOT IN (
        SELECT message_id FROM message_deleted_for WHERE user_id = ?
      )`);
      values.push(userId);
    }

    values.push(parseInt(limit));

    const [rows] = await pool.query(
      `SELECT m.* FROM messages m
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT ?`,
      values
    );

    const messages = [];
    for (const r of rows) {
      messages.push(await Message._hydrate(r));
    }
    return messages.reverse();
  },

  async updateMany(criteria, updates) {
    const pool = getPool();
    const setClauses = [];
    const setVals = [];

    if (updates.status_read !== undefined) {
      setClauses.push('status_read = ?');
      setVals.push(updates.status_read ? 1 : 0);
    }

    const conditions = [];
    const whereVals = [];

    if (criteria.conversation_id) {
      conditions.push('conversation_id = ?');
      whereVals.push(criteria.conversation_id);
    }
    if (criteria.sender_id_ne) {
      conditions.push('sender_id != ?');
      whereVals.push(criteria.sender_id_ne);
    }

    if (setClauses.length === 0 || conditions.length === 0) return;

    await pool.query(
      `UPDATE messages SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`,
      [...setVals, ...whereVals]
    );

    // Insérer dans message_read_by
    if (updates.readBy && updates.readBy.userId) {
      await pool.query(
        `INSERT IGNORE INTO message_read_by (message_id, user_id)
         SELECT m.id, ? FROM messages m
         WHERE m.conversation_id = ? AND m.sender_id != ?`,
        [updates.readBy.userId, criteria.conversation_id, criteria.sender_id_ne]
      );
    }
  },

  async markAsDelivered(messageId, userId) {
    const pool = getPool();
    const [existing] = await pool.query(
      'SELECT 1 FROM message_delivered_to WHERE message_id = ? AND user_id = ?',
      [messageId, userId]
    );
    if (existing.length === 0) {
      await pool.query(
        'INSERT INTO message_delivered_to (message_id, user_id) VALUES (?, ?)',
        [messageId, userId]
      );
      await pool.query(
        'UPDATE messages SET status_delivered = 1 WHERE id = ?',
        [messageId]
      );
    }
  },

  async markAsRead(messageId, userId) {
    const pool = getPool();
    const [existing] = await pool.query(
      'SELECT 1 FROM message_read_by WHERE message_id = ? AND user_id = ?',
      [messageId, userId]
    );
    if (existing.length === 0) {
      await pool.query(
        'INSERT INTO message_read_by (message_id, user_id) VALUES (?, ?)',
        [messageId, userId]
      );
      await pool.query(
        'UPDATE messages SET status_read = 1 WHERE id = ?',
        [messageId]
      );
    }
  },

  async edit(messageId, newContent) {
    const pool = getPool();
    await pool.query(
      'UPDATE messages SET content = ?, is_edited = 1, edited_at = NOW() WHERE id = ?',
      [newContent, messageId]
    );
    return await Message.findById(messageId);
  },

  async softDelete(messageId, userId, forEveryone = false) {
    const pool = getPool();
    if (forEveryone) {
      await pool.query(
        'UPDATE messages SET is_deleted = 1, deleted_at = NOW() WHERE id = ?',
        [messageId]
      );
    } else {
      await pool.query(
        'INSERT IGNORE INTO message_deleted_for (message_id, user_id) VALUES (?, ?)',
        [messageId, userId]
      );
    }
  },

  async _hydrate(row) {
    const pool = getPool();

    // Vérifier l'expiration du média
    const now = new Date();
    const mediaIsExpired = row.media_expired === 1 ||
      (row.media_expires_at && new Date(row.media_expires_at) < now);

    // Si expiré et pas encore marqué en DB, le marquer
    if (mediaIsExpired && row.media_url && row.media_expired !== 1) {
      pool.query('UPDATE messages SET media_expired = 1 WHERE id = ?', [row.id]).catch(() => {});
    }

    // Sender (sécurisé — null si l'utilisateur est introuvable)
    let sender = null;
    if (row.sender_id) {
      const [sRows] = await pool.query(
        'SELECT id, email, name, avatar, status, is_online, last_seen FROM users WHERE id = ?',
        [row.sender_id]
      );
      if (sRows[0]) {
        sender = {
          id:       sRows[0].id,
          _id:      sRows[0].id,
          email:    sRows[0].email,
          name:     sRows[0].name,
          avatar:   sRows[0].avatar,
          status:   sRows[0].status,
          isOnline: !!sRows[0].is_online,
          lastSeen: sRows[0].last_seen
        };
      }
    }

    // Message répondu
    let replyTo = null;
    if (row.reply_to_id) {
      const [rRows] = await pool.query('SELECT id, content, type FROM messages WHERE id = ?', [row.reply_to_id]);
      if (rRows[0]) replyTo = { id: rRows[0].id, _id: rRows[0].id, content: rRows[0].content, type: rRows[0].type };
    }

    // ReadBy et DeliveredTo
    const [readByRows] = await pool.query(
      'SELECT user_id, read_at FROM message_read_by WHERE message_id = ?', [row.id]
    );
    const [deliveredRows] = await pool.query(
      'SELECT user_id, delivered_at FROM message_delivered_to WHERE message_id = ?', [row.id]
    );

    const msgId = row.id;

    const obj = {
      id:            msgId,
      _id:           msgId,
      conversation:  row.conversation_id,
      conversationId: row.conversation_id,
      sender,
      senderId:      row.sender_id,
      type:          row.type,
      content:       row.content,
      replyTo,
      isEdited:      !!row.is_edited,
      editedAt:      row.edited_at,
      isDeleted:     !!row.is_deleted,
      deletedAt:     row.deleted_at,
      status: {
        sent:      !!row.status_sent,
        delivered: !!row.status_delivered,
        read:      !!row.status_read
      },
      readBy:      readByRows.map(r => ({ user: r.user_id, readAt: r.read_at })),
      deliveredTo: deliveredRows.map(d => ({ user: d.user_id, deliveredAt: d.delivered_at })),
      media: (row.media_url && !mediaIsExpired) ? {
        url:      row.media_url,
        filename: row.media_filename,
        mimeType: row.media_mime_type,
        size:     row.media_size,
        thumbnail: row.media_thumbnail,
        duration:  row.media_duration
      } : null,
      mediaExpired:   mediaIsExpired && !!row.media_url,
      mediaExpiresAt: row.media_expires_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,

      // Méthodes d'instance
      async markAsDelivered(userId) { return Message.markAsDelivered(msgId, userId); },
      async markAsRead(userId)      { return Message.markAsRead(msgId, userId); },
      async edit(newContent) {
        const updated = await Message.edit(msgId, newContent);
        Object.assign(obj, updated);
        return obj;
      },
      async softDelete(userId, forEveryone = false) {
        return Message.softDelete(msgId, userId, forEveryone);
      },
      async save() { return obj; }
    };

    return obj;
  }
};

module.exports = Message;
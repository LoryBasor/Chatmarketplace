// src/models/Conversation.js — DAO MySQL (corrigé)
const { getPool } = require('../config/database');

const Conversation = {

  async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM conversations WHERE id = ?', [id]);
    if (!rows[0]) return null;
    return await Conversation._hydrate(rows[0]);
  },

  async findOne(criteria = {}) {
    const pool = getPool();

    // Recherche conversation individuelle entre 2 participants
    if (criteria.participants_all && criteria.participants_size === 2) {
      const [p1, p2] = criteria.participants_all;
      const [rows] = await pool.query(
        `SELECT c.* FROM conversations c
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
         WHERE c.type = ? AND c.is_active = 1
           AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2
         LIMIT 1`,
        [p1, p2, criteria.type || 'individual']
      );
      if (!rows[0]) return null;
      return await Conversation._hydrate(rows[0]);
    }

    // Recherche par id + participant
    if (criteria.id && criteria.participant) {
      const [rows] = await pool.query(
        `SELECT c.* FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
         WHERE c.id = ? LIMIT 1`,
        [criteria.participant, criteria.id]
      );
      if (!rows[0]) return null;
      return await Conversation._hydrate(rows[0]);
    }

    // Recherche simple par id
    if (criteria.id) {
      return await Conversation.findById(criteria.id);
    }

    return null;
  },

  async create({ participants, type = 'individual', name = null, avatar = null }) {
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO conversations (type, name, avatar) VALUES (?, ?, ?)',
      [type, name, avatar]
    );
    const conversationId = result.insertId;

    for (const userId of participants) {
      await pool.query(
        'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
        [conversationId, userId]
      );
      await pool.query(
        'INSERT IGNORE INTO unread_counts (conversation_id, user_id, count) VALUES (?, ?, 0)',
        [conversationId, userId]
      );
    }
    return await Conversation.findById(conversationId);
  },

  async findByUser(userId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.* FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.user_id = ? AND c.is_active = 1
       ORDER BY c.last_message_at DESC`,
      [userId]
    );
    // Hydratation séquentielle pour éviter les problèmes de pool
    const results = [];
    for (const row of rows) {
      results.push(await Conversation._hydrate(row));
    }
    return results;
  },

  async incrementUnread(conversationId, userId) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO unread_counts (conversation_id, user_id, count) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [conversationId, userId]
    );
  },

  async resetUnread(conversationId, userId) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO unread_counts (conversation_id, user_id, count) VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE count = 0`,
      [conversationId, userId]
    );
  },

  async getUnreadCount(conversationId, userId) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT count FROM unread_counts WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    return rows[0] ? rows[0].count : 0;
  },

  async updateLastMessage(conversationId, messageId, messageAt) {
    const pool = getPool();
    await pool.query(
      'UPDATE conversations SET last_message_id = ?, last_message_at = ?, updated_at = NOW() WHERE id = ?',
      [messageId, messageAt, conversationId]
    );
  },

  async _hydrate(row) {
    const pool = getPool();

    // Participants
    const [participants] = await pool.query(
      `SELECT u.id, u.email, u.name, u.avatar, u.status, u.is_online, u.last_seen
       FROM users u
       JOIN conversation_participants cp ON cp.user_id = u.id
       WHERE cp.conversation_id = ?`,
      [row.id]
    );

    // Dernier message (simple, sans hydratation complète pour éviter récursion)
    let lastMessage = null;
    if (row.last_message_id) {
      const [msgRows] = await pool.query(
        `SELECT m.*, u.id as su_id, u.name as su_name, u.avatar as su_avatar
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`,
        [row.last_message_id]
      );
      if (msgRows[0]) {
        const mr = msgRows[0];
        lastMessage = {
          id: mr.id,
          _id: mr.id,
          type: mr.type,
          content: mr.content,
          createdAt: mr.created_at,
          sender: mr.su_id ? { id: mr.su_id, _id: mr.su_id, name: mr.su_name, avatar: mr.su_avatar } : null
        };
      }
    }

    // Compter les non-lus
    const unreadMap = {};
    for (const p of participants) {
      const count = await Conversation.getUnreadCount(row.id, p.id);
      unreadMap[p.id] = count;
    }

    const mappedParticipants = participants.map(p => ({
      id:       p.id,
      _id:      p.id,
      email:    p.email,
      name:     p.name,
      avatar:   p.avatar,
      status:   p.status,
      isOnline: !!p.is_online,
      lastSeen: p.last_seen
    }));

    const convId = row.id;

    const obj = {
      id:            convId,
      _id:           convId,
      type:          row.type,
      name:          row.name,
      avatar:        row.avatar,
      lastMessage,
      lastMessageAt: row.last_message_at,
      isActive:      !!row.is_active,
      participants:  mappedParticipants,
      unreadCount:   unreadMap,
      createdAt:     row.created_at,
      updatedAt:     row.updated_at,

      async incrementUnread(userId) {
        return Conversation.incrementUnread(convId, userId);
      },
      async resetUnread(userId) {
        return Conversation.resetUnread(convId, userId);
      },
      async save() {
        await Conversation.updateLastMessage(
          convId,
          this.lastMessage ? (this.lastMessage.id || this.lastMessage) : null,
          this.lastMessageAt
        );
      },
      toObject() { return { ...this }; }
    };

    return obj;
  }
};

module.exports = Conversation;
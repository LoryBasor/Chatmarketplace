// src/models/User.js — DAO MySQL
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/database');

const User = {
  // Trouver un utilisateur par ID
  async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] ? User._hydrate(rows[0]) : null;
  },

  // Trouver un utilisateur selon un critère
  async findOne(criteria) {
    const pool = getPool();
    const keys = Object.keys(criteria);
    if (keys.length === 0) return null;

    // Conversion camelCase → snake_case pour les champs communs
    const colMap = { email: 'email', socketId: 'socket_id', isOnline: 'is_online' };
    const conditions = keys.map(k => `${colMap[k] || k} = ?`).join(' AND ');
    const values = keys.map(k => criteria[k]);

    const [rows] = await pool.query(
      `SELECT * FROM users WHERE ${conditions} LIMIT 1`,
      values
    );
    return rows[0] ? User._hydrate(rows[0]) : null;
  },

  // Créer un utilisateur
  async create({ email, password, name, avatar = 'default-avatar.png', status = 'Disponible' }) {
    const pool = getPool();
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, password, name, avatar, status) VALUES (?, ?, ?, ?, ?)`,
      [email.toLowerCase().trim(), hashedPassword, name.trim(), avatar, status]
    );
    return User.findById(result.insertId);
  },

  // Mettre à jour un utilisateur et retourner la version mise à jour
  async findByIdAndUpdate(id, updates, options = {}) {
    const pool = getPool();
    const colMap = {
      name: 'name',
      status: 'status',
      avatar: 'avatar',
      isOnline: 'is_online',
      lastSeen: 'last_seen',
      socketId: 'socket_id',
      blockedUsers: 'blocked_users',
      settings: 'settings',
      password: 'password'
    };

    const setClauses = [];
    const values = [];

    for (const [key, val] of Object.entries(updates)) {
      const col = colMap[key] || key;
      if (col === 'blocked_users' || col === 'settings') {
        setClauses.push(`${col} = ?`);
        values.push(JSON.stringify(val));
      } else {
        setClauses.push(`${col} = ?`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) return User.findById(id);

    values.push(id);
    await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, values);
    return User.findById(id);
  },

  // Récupérer plusieurs utilisateurs
  async find(criteria = {}, { select = [], limit = 20, skip = 0, sort = 'name ASC' } = {}) {
    const pool = getPool();
    const conditions = [];
    const values = [];

    if (criteria._id_ne !== undefined) {
      conditions.push('id != ?');
      values.push(criteria._id_ne);
    }
    if (criteria.search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      values.push(`%${criteria.search}%`, `%${criteria.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM users ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...values, limit, skip]
    );
    return rows.map(User._hydrate);
  },

  // Compter les utilisateurs
  async countDocuments(criteria = {}) {
    const pool = getPool();
    const conditions = [];
    const values = [];

    if (criteria._id_ne !== undefined) {
      conditions.push('id != ?');
      values.push(criteria._id_ne);
    }
    if (criteria.search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      values.push(`%${criteria.search}%`, `%${criteria.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`SELECT COUNT(*) as total FROM users ${where}`, values);
    return rows[0].total;
  },

  // Transformer la ligne SQL en objet JS utilisable
  _hydrate(row) {
    const obj = {
      id: row.id,
      _id: row.id, // compatibilité
      email: row.email,
      password: row.password,
      name: row.name,
      avatar: row.avatar,
      status: row.status,
      isOnline: !!row.is_online,
      lastSeen: row.last_seen,
      socketId: row.socket_id,
      blockedUsers: typeof row.blocked_users === 'string'
        ? JSON.parse(row.blocked_users)
        : (row.blocked_users || []),
      settings: typeof row.settings === 'string'
        ? JSON.parse(row.settings)
        : (row.settings || { notifications: true, soundEnabled: true }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,

      // Méthodes d'instance
      async comparePassword(candidatePassword) {
        return bcrypt.compare(candidatePassword, row.password);
      },
      toPublicJSON() {
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          avatar: row.avatar,
          status: row.status,
          isOnline: !!row.is_online,
          lastSeen: row.last_seen
        };
      },
      async save() {
        return User.findByIdAndUpdate(row.id, {
          name: this.name,
          status: this.status,
          avatar: this.avatar,
          isOnline: this.isOnline,
          lastSeen: this.lastSeen,
          socketId: this.socketId,
          blockedUsers: this.blockedUsers,
          settings: this.settings
        });
      }
    };
    return obj;
  }
};

module.exports = User;

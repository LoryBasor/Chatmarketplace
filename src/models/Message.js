// src/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'document', 'audio', 'system'],
    default: 'text'
  },
  content: {
    type: String,
    maxlength: 5000
  },
  media: {
    url: String,
    filename: String,
    mimeType: String,
    size: Number,
    thumbnail: String,
    duration: Number // Pour audio/vidéo
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  status: {
    sent: {
      type: Boolean,
      default: true
    },
    delivered: {
      type: Boolean,
      default: false
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  deliveredTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Index composites pour performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, 'status.read': 1 });

// Méthode pour marquer comme livré
messageSchema.methods.markAsDelivered = async function(userId) {
  if (!this.deliveredTo.some(d => d.user.equals(userId))) {
    this.deliveredTo.push({ user: userId, deliveredAt: new Date() });
    this.status.delivered = true;
    await this.save();
  }
  return this;
};

// Méthode pour marquer comme lu
messageSchema.methods.markAsRead = async function(userId) {
  if (!this.readBy.some(r => r.user.equals(userId))) {
    this.readBy.push({ user: userId, readAt: new Date() });
    this.status.read = true;
    await this.save();
  }
  return this;
};

// Méthode pour éditer le message
messageSchema.methods.edit = async function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  await this.save();
  return this;
};

// Méthode pour supprimer
messageSchema.methods.softDelete = async function(userId, forEveryone = false) {
  if (forEveryone) {
    this.isDeleted = true;
    this.deletedAt = new Date();
  } else {
    if (!this.deletedFor.includes(userId)) {
      this.deletedFor.push(userId);
    }
  }
  await this.save();
  return this;
};

module.exports = mongoose.model('Message', messageSchema);
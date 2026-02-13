// src/services/notificationService.js
class NotificationService {
  // Envoyer une notification push
  static async sendPushNotification(userId, notification) {
    // À implémenter avec un service de notification push
    // Exemple: Firebase Cloud Messaging, OneSignal, etc.
    console.log('Push notification:', userId, notification);
  }

  // Envoyer une notification par email
  static async sendEmailNotification(userEmail, subject, content) {
    // À implémenter avec un service d'email
    // Exemple: SendGrid, Mailgun, Nodemailer, etc.
    console.log('Email notification:', userEmail, subject);
  }

  // Créer une notification pour un nouveau message
  static async notifyNewMessage(message, recipients) {
    const User = require('../models/User');
    
    for (const recipientId of recipients) {
      const user = await User.findById(recipientId);
      
      if (user && user.settings.notifications && !user.isOnline) {
        await this.sendPushNotification(recipientId, {
          title: `Nouveau message de ${message.sender.name}`,
          body: message.type === 'text' ? message.content : `${message.type}`,
          icon: message.sender.avatar,
          data: {
            conversationId: message.conversation,
            messageId: message._id
          }
        });
      }
    }
  }
}

module.exports = NotificationService;

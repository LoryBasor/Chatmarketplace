// src/controllers/userController.js
const User = require('../models/User');
const Conversation = require('../models/Conversation');

// Récupérer tous les utilisateurs (pour la recherche)
exports.getUsers = async (req, res, next) => {
  try {
    const { search, limit = 20, page = 1 } = req.query;
    const query = { _id: { $ne: req.userId } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ name: 1 });

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(u => u.toPublicJSON()),
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Obtenir un utilisateur spécifique
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ user: user.toPublicJSON() });
  } catch (error) {
    next(error);
  }
};

// Mettre à jour le profil
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, status, settings } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (status) updates.status = status;
    if (settings) updates.settings = settings;

    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ user: user.toPublicJSON() });
  } catch (error) {
    next(error);
  }
};

// Bloquer/débloquer un utilisateur
exports.toggleBlockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(req.userId);

    const isBlocked = currentUser.blockedUsers.includes(userId);

    if (isBlocked) {
      currentUser.blockedUsers = currentUser.blockedUsers.filter(
        id => id.toString() !== userId
      );
    } else {
      currentUser.blockedUsers.push(userId);
    }

    await currentUser.save();

    res.json({
      message: isBlocked ? 'Utilisateur débloqué' : 'Utilisateur bloqué',
      isBlocked: !isBlocked
    });
  } catch (error) {
    next(error);
  }
};
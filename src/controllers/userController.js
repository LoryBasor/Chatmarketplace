// src/controllers/userController.js
const User = require('../models/User');
const Conversation = require('../models/Conversation');

// Récupérer tous les utilisateurs (pour la recherche)
exports.getUsers = async (req, res, next) => {
  try {
    const { search, limit = 20, page = 1 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage  = parseInt(page);
    const skip = (parsedPage - 1) * parsedLimit;

    const criteria = { _id_ne: req.userId };
    if (search) criteria.search = search;

    const users = await User.find(criteria, {
      limit: parsedLimit,
      skip,
      sort: 'name ASC'
    });

    const total = await User.countDocuments(criteria);

    res.json({
      users: users.map(u => u.toPublicJSON()),
      pagination: {
        total,
        page: parsedPage,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Obtenir un utilisateur spécifique
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
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

    if (name)     updates.name = name;
    if (status)   updates.status = status;
    if (settings) updates.settings = settings;

    const user = await User.findByIdAndUpdate(req.userId, updates);

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

    const blockedUsers = currentUser.blockedUsers || [];
    const isBlocked = blockedUsers.some(id => String(id) === String(userId));

    let updatedList;
    if (isBlocked) {
      updatedList = blockedUsers.filter(id => String(id) !== String(userId));
    } else {
      updatedList = [...blockedUsers, parseInt(userId)];
    }

    await User.findByIdAndUpdate(req.userId, { blockedUsers: updatedList });

    res.json({
      message: isBlocked ? 'Utilisateur débloqué' : 'Utilisateur bloqué',
      isBlocked: !isBlocked
    });
  } catch (error) {
    next(error);
  }
};
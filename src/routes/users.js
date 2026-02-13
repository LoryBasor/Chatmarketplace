// src/routes/users.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.use(auth); // Toutes les routes nécessitent l'authentification

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.put('/profile', userController.updateProfile);
router.put('/avatar', upload.single('avatar'), async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: req.file.filename },
      { new: true }
    ).select('-password');
    res.json({ user: user.toPublicJSON() });
  } catch (error) {
    next(error);
  }
});
router.post('/:userId/block', userController.toggleBlockUser);

module.exports = router;
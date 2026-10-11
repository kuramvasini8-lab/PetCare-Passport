const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/notifications - List user's notifications
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    return res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
  }
});

// PATCH /api/notifications/:id/read - Mark specific notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true });
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
});

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
});

// POST /api/notifications/test - Trigger an instant test notification
router.post('/test', async (req, res) => {
  try {
    const { title, message, type } = req.body;
    const notif = await Notification.create({
      user: req.user._id,
      title: title || '🔔 Live Notification Verified',
      message: message || `Real-time notifications active and received at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}!`,
      type: type || 'success',
      link: '#dashboard',
    });
    return res.status(201).json({ success: true, message: 'Notification sent!', notification: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create test notification.' });
  }
});

module.exports = router;

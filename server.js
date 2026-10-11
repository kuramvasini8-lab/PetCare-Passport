require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectDB } = require('./src/config/db');
const { bootstrapAdmin } = require('./src/services/seedService');

const authRoutes = require('./src/routes/auth');
const petRoutes = require('./src/routes/pets');
const healthRoutes = require('./src/routes/health');
const emergencyRoutes = require('./src/routes/emergency');
const reportRoutes = require('./src/routes/reports');
const notificationRoutes = require('./src/routes/notifications');
const aiRoutes = require('./src/routes/ai');
const adminRoutes = require('./src/routes/admin');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Security & Body parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Health check / System diagnostic endpoint
app.get('/api/health-check', (req, res) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '' && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here');
  const aiConfigured = geminiConfigured || openRouterConfigured;
  const aiProvider = openRouterConfigured ? `OpenRouter (${process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free'})` : (geminiConfigured ? `Google Gemini (${process.env.GEMINI_MODEL || 'gemini-2.5-flash'})` : 'Not configured');

  res.json({
    status: 'online',
    appName: 'PetCare Passport',
    database: 'connected',
    aiProvider,
    aiConfigured,
    timestamp: new Date().toISOString(),
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);

// Single Page Application route fallback (Express 5 compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: `API route ${req.method} ${req.path} not found.` });
  }
  if (req.method === 'GET') {
    return res.sendFile(path.join(__dirname, 'public/index.html'));
  }
  next();
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Exception]:', err.message);
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
  });
});

// Initialize database and start listening
async function startServer() {
  try {
    const dbInfo = await connectDB();
    console.log(`[Database] Mode: ${dbInfo.type}`);

    // Safe bootstrap of platform administrator
    await bootstrapAdmin();

    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  PETCARE PASSPORT SERVER IS RUNNING`);
      console.log(`  Port: http://localhost:${PORT}`);
      console.log(`  Design: Calm Golden Fur & Natural Cream`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error('[Fatal Startup Error]:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;

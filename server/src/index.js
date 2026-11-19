const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const authRoutes = require('./routes/auth.routes');
const libraryRoutes = require('./routes/library.routes');
const studentRoutes = require('./routes/student.routes');
const seatRoutes = require('./routes/seat.routes');
const feeRoutes = require('./routes/fee.routes');
const paymentRoutes = require('./routes/payment.routes');
const reminderRoutes = require('./routes/reminder.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiRoutes = require('./routes/ai.routes');
const copilotRoutes = require('./routes/copilot.routes');
const publicRoutes = require('./routes/public.routes');
const { seedDatabase } = require('./seed');
const { migrateLibrarySlots } = require('./utils/librarySlotMigration');

const app = express();
const PORT = process.env.PORT || 5000;
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : true;

// Middleware
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/copilot', copilotRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SeatLedger MERN SaaS API',
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

app.use(express.static(path.resolve(__dirname, '../../client/dist')));

// Database Connection with In-Memory fallback for zero-configuration local start
async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/seatledger';

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const isAtlas = uri.includes('mongodb.net');
    console.log(`[Database] Connected successfully to ${isAtlas ? 'MongoDB Atlas (Cloud Permanent)' : 'MongoDB'}`);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }

    console.warn(`[Database] MongoDB URI connection issue (${err.message}). Starting MongoDB Memory Server...`);
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const memoryUri = mongod.getUri();
      await mongoose.connect(memoryUri);
      console.log(`[Database] Connected to in-memory MongoDB at ${memoryUri}`);
    } catch (memErr) {
      console.error('[Database] Failed to initialize in-memory MongoDB:', memErr.message);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      await seedDatabase();
    } catch (seedErr) {
      console.warn('[Seeder] Notice:', seedErr.message);
    }
  } else {
    console.log('[Seeder] Skipping demo data in production.');
  }

  try {
    await migrateLibrarySlots();
    console.log('[Library] Slot timings are up to date.');
  } catch (migrationErr) {
    console.error('[Library] Failed to migrate slot timings:', migrationErr.message);
  }
}

connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 SeatLedger MERN SaaS Server is running!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Port ${PORT} is already actively in use by another instance. API is online.`);
    } else {
      console.error('[Server Error]', err);
    }
  });
}).catch((err) => {
  console.error('[Startup] Unable to initialize the server:', err);
  process.exitCode = 1;
});

module.exports = app;

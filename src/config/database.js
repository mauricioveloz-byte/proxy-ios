const mongoose = require('mongoose');

let memoryServer;

async function connectDatabase() {
  if (process.env.MONGODB_MEMORY === 'true') {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri('customization_hub'));
    console.warn('Connected to temporary in-memory MongoDB; database contents reset on restart');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function closeDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = undefined;
  }
}

module.exports = { connectDatabase, closeDatabase };

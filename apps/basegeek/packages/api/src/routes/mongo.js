import express from 'express';
import { Router } from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { authenticateToken } from '../middleware/auth.js';

// Load environment variables
dotenv.config();

const router = express.Router();

// Example: protect all routes
router.use(authenticateToken);

// MongoDB connection details from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://datageek_user:DataGeek_User_2024@192.168.1.17:27018/datageek?authSource=admin';
const DB_NAME = process.env.MONGODB_DB_NAME || 'datageek';

router.get('/status', async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(MONGODB_URI);
    const adminDb = client.db().admin();
    const serverStatus = await adminDb.command({ serverStatus: 1 });
    const dbList = await adminDb.listDatabases();

    const databases = await Promise.all(
      dbList.databases.map(async (dbInfo) => {
        const db = client.db(dbInfo.name);
        let dbStats = {};
        let collections = [];
        try {
          dbStats = await db.command({ dbStats: 1 });
          const colls = await db.listCollections().toArray();
          collections = await Promise.all(
            colls.map(async (coll) => {
              let stats = {};
              try {
                stats = await db.command({ collStats: coll.name });
              } catch (e) {}
              return {
                name: coll.name,
                count: stats.count || 0,
                size: stats.size || 0,
                avgObjSize: stats.avgObjSize || 0,
                indexes: stats.nindexes || 0,
                indexSize: stats.totalIndexSize || 0
              };
            })
          );
        } catch (e) {}
        return {
          name: dbInfo.name,
          stats: dbStats,
          collections
        };
      })
    );

    res.json({
      status: 'connected',
      serverInfo: {
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        host: serverStatus.host,
        connections: serverStatus.connections.current,
        memory: serverStatus.mem ? {
          resident: serverStatus.mem.resident,
          virtual: serverStatus.mem.virtual
        } : undefined
      },
      databases
    });
  } catch (error) {
    console.error('MongoDB Status Error:', error);
    res.status(500).json({
      message: 'Failed to fetch MongoDB status',
      error: error.message
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

export default router;
import mongoose from 'mongoose';

const MONGO_BASE = 'mongodb://localhost:27017';

async function main() {
  const conn = mongoose.createConnection(`${ MONGO_BASE }/admin?authSource=admin`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  conn.on('connected', async () => {
    try {
      const adminDb = conn.db.admin();
      const list = await adminDb.listDatabases();
      console.log('Databases:', list.databases.map(db => db.name).join(', '));
    } catch (err) {
      console.error(err);
    } finally {
      conn.close();
    }
  });
}
main();

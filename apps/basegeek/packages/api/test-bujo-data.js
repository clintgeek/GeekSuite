import mongoose from 'mongoose';
import { getAppConnection } from './src/graphql/shared/appConnections.js';

async function checkData() {
  try {
    const conn = getAppConnection('bujogeek');

    // Wait for connection
    await new Promise(resolve => conn.once('open', resolve));
    console.log('Connected to bujogeek DB');

    const db = conn.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    if (collections.some(c => c.name === 'tasks')) {
      const count = await db.collection('tasks').countDocuments();
      console.log('Total tasks in bujogeek DB:', count);

      if (count > 0) {
        const sampleTask = await db.collection('tasks').findOne();
        console.log('Sample task document:');
        console.log(JSON.stringify(sampleTask, null, 2));

        console.log('\nSample createdBy field type:');
        console.log('Value:', sampleTask.createdBy);
        console.log('Type:', typeof sampleTask.createdBy);
        console.log('Is ObjectId:', sampleTask.createdBy instanceof mongoose.Types.ObjectId);
      }
    } else {
      console.log('No tasks collection found in bujogeek DB');
    }

    // Check datageek DB just in case
    const mainConn = mongoose.createConnection('mongodb://localhost:27017/datageek?authSource=admin');
    await new Promise(resolve => mainConn.once('open', resolve));
    const mainDb = mainConn.db;
    const mainCount = await mainDb.collection('tasks').countDocuments();
    console.log('\nTotal tasks in datageek DB:', mainCount);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();

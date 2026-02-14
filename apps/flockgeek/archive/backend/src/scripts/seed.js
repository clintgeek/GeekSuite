import mongoose from 'mongoose';
import Bird from '../models/Bird.js';
import Group from '../models/Group.js';
import EggProduction from '../models/EggProduction.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
const OWNER = process.env.SEED_OWNER_ID || 'demo-owner';

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');

  await Promise.all([
    Bird.deleteMany({ ownerId: OWNER }),
    Group.deleteMany({ ownerId: OWNER }),
    EggProduction.deleteMany({ ownerId: OWNER })
  ]);

  const hensData = [
    { tagId: 'FG-25-0001', name: 'Hen A', sex: 'hen', breed: 'Mixed' },
    { tagId: 'FG-25-0002', name: 'Hen B', sex: 'hen', breed: 'Mixed' },
    { tagId: 'FG-25-0003', name: 'Hen C', sex: 'hen', breed: 'Mixed' }
  ];
  const rooData = { tagId: 'ROO-25-001', name: 'Rex', sex: 'rooster', breed: 'Mixed' };

  const birds = await Bird.insertMany(hensData.map(h => ({ ownerId: OWNER, ...h })).concat([{ ownerId: OWNER, ...rooData }]));
  const hens = birds.filter(b => b.sex === 'hen');

  const group = await Group.create({ ownerId: OWNER, name: 'Layer Pen A', purpose: 'layer_flock', startDate: new Date() });

  const egg = await EggProduction.create({
    ownerId: OWNER,
    groupId: group._id,
    date: new Date().toISOString().slice(0, 10),
    eggsCount: 5,
    birdIdsSnapshot: hens.map(h => h._id),
    daysObserved: 1,
    source: 'manual',
    quality: 'ok'
  });

  console.log('Seeded:', { birds: birds.length, group: group._id.toString(), egg: egg._id.toString() });
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

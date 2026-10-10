/**
 * A real mongod (mongodb-memory-server) for the tests that depend on Mongo
 * semantics the code relies on: the (sourceId, guid) unique index, the
 * `feeds.$[f]` arrayFilters updates, upsert-with-$setOnInsert seeding.
 * One server per test file (node --test runs each file in its own process).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Place from '../../src/models/Place.js';
import Source from '../../src/models/Source.js';
import Article from '../../src/models/Article.js';

let server = null;

export const models = { Place, Source, Article };

export async function startMongo() {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('newsgeek'));
  await Promise.all([Place.init(), Source.init(), Article.init()]);
  return models;
}

export async function stopMongo() {
  await mongoose.disconnect();
  if (server) await server.stop();
  server = null;
}

export async function clearAll() {
  await Promise.all([Place.deleteMany({}), Source.deleteMany({}), Article.deleteMany({})]);
}

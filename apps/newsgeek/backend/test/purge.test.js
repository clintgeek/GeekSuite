/**
 * src/jobs/purge.js — retention.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import constants from '@geeksuite/schemas/newsgeek/constants';
import { runPurge, startPurgeSchedule } from '../src/jobs/purge.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

const { ARTICLE_RETENTION_DAYS } = constants;
const NOW = new Date('2026-10-10T15:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);

let Article;
before(async () => { ({ Article } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

const art = (guid, publishedAt) => ({
  sourceId: new mongoose.Types.ObjectId(), feedUrl: 'https://a.com/feed', guid, url: `https://a.com/${guid}`,
  canonicalUrl: `https://a.com/${guid}`, title: guid, titleKey: guid, publisher: 'A', publishedAt, fetchedAt: publishedAt,
});

describe('runPurge', () => {
  test(`articles older than ${ARTICLE_RETENTION_DAYS} days go; younger stay`, async () => {
    await Article.insertMany([art('old', daysAgo(ARTICLE_RETENTION_DAYS + 1)), art('edge', daysAgo(ARTICLE_RETENTION_DAYS - 1)), art('new', daysAgo(1))]);
    const out = await runPurge({ Article, now: () => NOW });
    assert.equal(out.articles, 1);
    assert.deepEqual((await Article.find().lean()).map((a) => a.guid).sort(), ['edge', 'new']);
  });

  test('the N2 pin hook: pinned articles survive', async () => {
    const [old] = await Article.insertMany([art('old', daysAgo(200))]);
    const out = await runPurge({ Article, now: () => NOW, pinned: async () => [old._id] });
    assert.equal(out.articles, 0);
    assert.equal(await Article.countDocuments(), 1);
  });
});

describe('startPurgeSchedule', () => {
  test('production only (or PURGE_AUTORUN=1); PURGE_DISABLED=1 wins', () => {
    assert.equal(startPurgeSchedule({ Article, env: { NODE_ENV: 'development' } }).enabled, false);
    const a = startPurgeSchedule({ Article, env: { NODE_ENV: 'production' }, bootDelayMs: 1e9 });
    assert.equal(a.enabled, true);
    a.stop();
    const b = startPurgeSchedule({ Article, env: { PURGE_AUTORUN: '1' }, bootDelayMs: 1e9 });
    assert.equal(b.enabled, true);
    b.stop();
    assert.equal(startPurgeSchedule({ Article, env: { NODE_ENV: 'production', PURGE_DISABLED: '1' } }).enabled, false);
  });
});

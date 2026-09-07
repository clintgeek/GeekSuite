import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askStatusLine } from './askStatus.js';

const search = { intent: { kind: 'search', keywords: ['coop'] }, answer: null, provider: 'cloudflare', model: 'x' };
const fallback = { intent: { kind: 'search', keywords: ['fix the coop door'] }, answer: null, provider: null, model: null };
const question = { intent: { kind: 'answer', keywords: ['reading'] }, answer: null, provider: 'groq', model: 'y' };

test('loading or no ask → no line', () => {
  assert.equal(askStatusLine({ ask: null }), null);
  assert.equal(askStatusLine({ ask: search, loading: true }), null);
});

test('an answer speaks for itself', () => {
  assert.equal(askStatusLine({ ask: { ...question, answer: 'Dune.' }, resultsCount: 0 }), null);
});

test('planner fell back (no provider) is said plainly, with and without matches', () => {
  assert.match(askStatusLine({ ask: fallback, resultsCount: 0 }), /did not answer in time.*No matches/);
  assert.match(askStatusLine({ ask: fallback, resultsCount: 3 }), /did not answer in time.*Matches below/);
});

test('a planned search reports empty results instead of "Matches below"', () => {
  assert.match(askStatusLine({ ask: search, resultsCount: 0 }), /No matches/);
  assert.equal(askStatusLine({ ask: search, resultsCount: 2 }), 'Read as a search. Matches below.');
});

test('a question with no grounded answer', () => {
  assert.match(askStatusLine({ ask: question, resultsCount: 0 }), /no matches/);
  assert.match(askStatusLine({ ask: question, resultsCount: 1 }), /closest matches are below/);
});

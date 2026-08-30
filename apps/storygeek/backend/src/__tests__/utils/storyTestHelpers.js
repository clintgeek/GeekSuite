// Shared fixtures for the jest-based story ownership tests. Deliberately
// framework-agnostic (no `jest` reference) so it can be imported by any
// test file regardless of mocking setup.

export function buildStoryDoc(overrides = {}) {
  const base = {
    _id: 'story-1',
    userId: 'user-owner',
    title: 'Test Story',
    genre: 'Fantasy',
    description: '',
    status: 'active',
    worldState: {
      currentSituation: 'Something is happening',
      turnNumber: 1,
    },
    stats: {
      totalInteractions: 3,
      totalDiceRolls: 0,
      lastActive: new Date('2026-01-01T00:00:00Z'),
    },
    storySummaries: [
      {
        summary: 'The hero began their journey.',
        keywords: {
          characters: ['Hero'],
          locations: ['Village'],
          items: [],
          concepts: [],
          events: [],
        },
        importantDetails: [
          { type: 'character', name: 'Hero', description: 'the protagonist', relevance: 'high' },
        ],
      },
    ],
    events: [],
    characters: [],
    locations: [],
    checkpoints: [],
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  const doc = { ...base, ...overrides };
  if (!doc.save) {
    doc.save = async function save() {
      return this;
    };
  }
  return doc;
}

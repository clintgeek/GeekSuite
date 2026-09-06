import { describe, test, expect } from '@jest/globals';
import { planIndexChange } from '../../../scripts/fixBarcodeUniqueIndex.js';

// Hermetic — no Mongo. `planIndexChange` takes the plain array shape
// `collection.indexes()` returns, so this drives every branch with no
// connection at all, the same pattern `encryptGarminPasswords.js`'s
// `runBackfill` uses against a fake collection.

describe('fixBarcodeUniqueIndex — planIndexChange (Q40)', () => {
  test('no barcode index at all -> nothing to do', () => {
    const plan = planIndexChange([
      { key: { _id: 1 }, name: '_id_' },
      { key: { name: 1, brand: 1 }, name: 'name_1_brand_1' }
    ]);
    expect(plan).toEqual({ action: 'none', reason: 'no single-key index on barcode exists' });
  });

  test('the compound barcode+is_deleted index is not the one in question', () => {
    // findOrCreate's lookup index — two keys, not the unique constraint.
    const plan = planIndexChange([
      { key: { barcode: 1, is_deleted: 1 }, name: 'barcode_1_is_deleted_1' }
    ]);
    expect(plan.action).toBe('none');
  });

  test('the stale unique+sparse index (pre-Q40) is flagged for drop', () => {
    const plan = planIndexChange([
      { key: { barcode: 1 }, name: 'barcode_1', unique: true, sparse: true }
    ]);
    expect(plan.action).toBe('drop');
    expect(plan.name).toBe('barcode_1');
    expect(plan.reason).toContain('barcode_1');
    expect(plan.reason).toContain('unique=true');
    expect(plan.reason).toContain('sparse=true');
  });

  test('an index already carrying the expected partial filter -> nothing to do (already migrated)', () => {
    const plan = planIndexChange([
      {
        key: { barcode: 1 },
        name: 'barcode_1',
        unique: true,
        partialFilterExpression: { is_deleted: false, barcode: { $type: 'string' } }
      }
    ]);
    expect(plan).toEqual({
      action: 'none',
      reason: 'already migrated (barcode_1)'
    });
  });

  test('a partial index with a DIFFERENT filter is still flagged stale', () => {
    // Guards against a hand-built variant that isn't quite what the schema
    // now declares — re-running the migration should still converge it.
    const plan = planIndexChange([
      {
        key: { barcode: 1 },
        name: 'barcode_1',
        unique: true,
        partialFilterExpression: { is_deleted: false }
      }
    ]);
    expect(plan.action).toBe('drop');
  });

  test('re-running after a successful migration is a no-op (idempotent)', () => {
    // Simulates: drop the stale index, app boots, autoIndex builds the new
    // one, script runs again.
    const afterMigration = [
      { key: { barcode: 1, is_deleted: 1 }, name: 'barcode_1_is_deleted_1' },
      {
        key: { barcode: 1 },
        name: 'barcode_1',
        unique: true,
        partialFilterExpression: { is_deleted: false, barcode: { $type: 'string' } }
      }
    ];
    expect(planIndexChange(afterMigration).action).toBe('none');
    // Same input, same answer.
    expect(planIndexChange(afterMigration)).toEqual(planIndexChange(afterMigration));
  });
});

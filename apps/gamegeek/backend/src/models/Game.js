/**
 * Game — the household catalog entry. Built from the shared factory in
 * @geeksuite/schemas so this backend and basegeek's GraphQL gateway can
 * never drift (BookGeek's hand-duplicated `Book` model is the cautionary
 * tale — DOCS/GameGeekPlan.md §1.1).
 *
 * This backend never writes plain-data fields directly except covers and
 * imports (its documented scope) — see DOCS/GameGeekPlan.md §4.1: "the
 * gateway owns every plain-data read and write from day one."
 *
 * Default import + destructure: the shared module is CommonJS, which is the
 * interop form that works identically under Node ESM.
 */
import mongoose from 'mongoose';
import gameSchemaModule from '@geeksuite/schemas/gamegeek/game';

const { createGameSchema } = gameSchemaModule;

const schema = createGameSchema(mongoose);

// Guard against re-registration — supertest/node:test can import app.js
// (and therefore this module) more than once per process.
export default mongoose.models.Game || mongoose.model('Game', schema);

/**
 * Thing — built from the shared factory in @geeksuite/schemas/thinggeek so
 * this backend and basegeek's gateway cannot drift. Collection `things` in
 * the database MONGODB_URI names (thinggeek).
 *
 * This backend's writes to a Thing are limited to its documented scope
 * (DOCS/THINGGEEK_PLAN.md "Architecture"): pushing photo/document entries on
 * upload, and the trash purge. Every other field is the gateway's.
 */
import mongoose from 'mongoose';
import thingModule from '@geeksuite/schemas/thinggeek/thing';

const { createThingSchema } = thingModule;

// Guard against re-registration — node:test can import this more than once.
export default mongoose.models.Thing || mongoose.model('Thing', createThingSchema(mongoose), 'things');

import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// One owned item, household-scoped, soft-deleted into Trash. Shared definition (fields + indexes) in @geeksuite/schemas/thinggeek/thing,
// the same one the thinggeek backend uses — add fields there, never here.
import schemaModule from '@geeksuite/schemas/thinggeek/thing';

const { createThingSchema } = schemaModule;

const conn = getAppConnection('thinggeek');

export const Thing = conn.models.Thing || conn.model('Thing', createThingSchema(mongoose), 'things');

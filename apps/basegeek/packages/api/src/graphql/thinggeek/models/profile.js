import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Per-user saved views + the starter-type seeding marker. Shared definition (fields + indexes) in @geeksuite/schemas/thinggeek/profile,
// the same one the thinggeek backend uses — add fields there, never here.
import schemaModule from '@geeksuite/schemas/thinggeek/profile';

const { createThingProfileSchema } = schemaModule;

const conn = getAppConnection('thinggeek');

export const ThingProfile = conn.models.ThingProfile || conn.model('ThingProfile', createThingProfileSchema(mongoose), 'thingprofiles');

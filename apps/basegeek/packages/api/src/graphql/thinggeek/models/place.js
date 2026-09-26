import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// The household's place tree. Shared definition (fields + indexes) in @geeksuite/schemas/thinggeek/place,
// the same one the thinggeek backend uses — add fields there, never here.
import schemaModule from '@geeksuite/schemas/thinggeek/place';

const { createPlaceSchema } = schemaModule;

const conn = getAppConnection('thinggeek');

export const Place = conn.models.Place || conn.model('Place', createPlaceSchema(mongoose), 'places');

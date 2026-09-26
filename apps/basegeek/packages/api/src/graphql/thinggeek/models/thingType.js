import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// A household-editable type (the schema for a Thing's attributes). Shared definition (fields + indexes) in @geeksuite/schemas/thinggeek/thingType,
// the same one the thinggeek backend uses — add fields there, never here.
import schemaModule from '@geeksuite/schemas/thinggeek/thingType';

const { createThingTypeSchema } = schemaModule;

const conn = getAppConnection('thinggeek');

export const ThingType = conn.models.ThingType || conn.model('ThingType', createThingTypeSchema(mongoose), 'thingtypes');

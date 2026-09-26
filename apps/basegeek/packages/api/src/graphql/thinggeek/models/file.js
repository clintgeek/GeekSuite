import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// A stored photo/document record. Written by the backend only; read here for URLs. Shared definition (fields + indexes) in @geeksuite/schemas/thinggeek/file,
// the same one the thinggeek backend uses — add fields there, never here.
import schemaModule from '@geeksuite/schemas/thinggeek/file';

const { createFileSchema } = schemaModule;

const conn = getAppConnection('thinggeek');

export const ThingFile = conn.models.ThingFile || conn.model('ThingFile', createFileSchema(mongoose), 'files');

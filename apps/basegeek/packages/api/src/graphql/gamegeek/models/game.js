import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// The field set, derived fields (sortTitle, owned) and every index live in
// @geeksuite/schemas/gamegeek/game, so this model and the gamegeek backend's
// (covers + imports) cannot drift. Do NOT add fields here — add them to the
// shared module. Default import + destructure: the shared module is CommonJS
// (same interop as fitnessgeek/models/WeightGoals.js).
import gameSchemaModule from '@geeksuite/schemas/gamegeek/game';

const { createGameSchema } = gameSchemaModule;

const gameConn = getAppConnection('gamegeek');

export const Game = gameConn.models.Game || gameConn.model('Game', createGameSchema(mongoose), 'games');

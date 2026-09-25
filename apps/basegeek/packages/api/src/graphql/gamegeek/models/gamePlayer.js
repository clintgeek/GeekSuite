import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// One user's state for one household game. Shared definition — see game.js.
import gamePlayerSchemaModule from '@geeksuite/schemas/gamegeek/gamePlayer';

const { createGamePlayerSchema } = gamePlayerSchemaModule;

const gameConn = getAppConnection('gamegeek');

export const GamePlayer =
  gameConn.models.GamePlayer || gameConn.model('GamePlayer', createGamePlayerSchema(mongoose), 'gameplayers');

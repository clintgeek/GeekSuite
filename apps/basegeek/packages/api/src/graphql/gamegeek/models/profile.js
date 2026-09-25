import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Per-user shelves, saved filters, hardware. Shared definition — see game.js.
import profileSchemaModule from '@geeksuite/schemas/gamegeek/profile';

const { createGameProfileSchema } = profileSchemaModule;

const gameConn = getAppConnection('gamegeek');

export const GameProfile =
  gameConn.models.GameProfile || gameConn.model('GameProfile', createGameProfileSchema(mongoose), 'gameprofiles');

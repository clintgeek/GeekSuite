import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Playnite games someone deleted from GameGeek. Written here (deleteGame,
// updateGame dropping a Playnite copy); the gamegeek backend's Playnite import
// reads it and never brings those games back. Fields and index live in
// @geeksuite/schemas/gamegeek/playniteTombstone.
import playniteTombstoneSchemaModule from '@geeksuite/schemas/gamegeek/playniteTombstone';

const { createPlayniteTombstoneSchema } = playniteTombstoneSchemaModule;

const gameConn = getAppConnection('gamegeek');

export const PlayniteTombstone =
  gameConn.models.PlayniteTombstone ||
  gameConn.model('PlayniteTombstone', createPlayniteTombstoneSchema(mongoose), 'playnitetombstones');

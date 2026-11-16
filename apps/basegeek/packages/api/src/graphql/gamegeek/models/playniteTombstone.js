import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Playnite games someone deleted from GameGeek. Written here (deleteGame,
// updateGame dropping a Playnite copy); the gamegeek backend's Playnite import
// reads it and never brings those games back. Fields and index live in
// @geeksuite/schemas/gamegeek/playniteTombstone.
//
// DeletedGame (same shared module): the snapshot a delete keeps so Settings →
// Deleted games can restore the game with every member's state (S-D1).
import playniteTombstoneSchemaModule from '@geeksuite/schemas/gamegeek/playniteTombstone';

const { createPlayniteTombstoneSchema, createDeletedGameSchema } = playniteTombstoneSchemaModule;

const gameConn = getAppConnection('gamegeek');

export const PlayniteTombstone =
  gameConn.models.PlayniteTombstone ||
  gameConn.model('PlayniteTombstone', createPlayniteTombstoneSchema(mongoose), 'playnitetombstones');

export const DeletedGame =
  gameConn.models.DeletedGame || gameConn.model('DeletedGame', createDeletedGameSchema(mongoose), 'deletedgames');

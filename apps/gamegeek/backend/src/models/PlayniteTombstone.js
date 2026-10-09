/**
 * PlayniteTombstone — Playnite games someone deleted from GameGeek; the
 * import never brings them back. Collection `gamegeek.playnitetombstones`,
 * written by the gateway, read here. See @geeksuite/schemas/gamegeek/playniteTombstone.
 */
import mongoose from 'mongoose';
import playniteTombstoneSchemaModule from '@geeksuite/schemas/gamegeek/playniteTombstone';

const { createPlayniteTombstoneSchema } = playniteTombstoneSchemaModule;

const schema = createPlayniteTombstoneSchema(mongoose);

export default mongoose.models.PlayniteTombstone || mongoose.model('PlayniteTombstone', schema);

/**
 * PlayniteDropFile — the Nextcloud folder-drop ledger. Collection
 * `playnitedropfiles` (mongoose's default pluralized form of the model name).
 * See @geeksuite/schemas/gamegeek/playniteDropFile and
 * apps/gamegeek/DOCS/PLAYNITE_IMPORT.md.
 */
import mongoose from 'mongoose';
import playniteDropFileSchemaModule from '@geeksuite/schemas/gamegeek/playniteDropFile';

const { createPlayniteDropFileSchema } = playniteDropFileSchemaModule;

const schema = createPlayniteDropFileSchema(mongoose);

export default mongoose.models.PlayniteDropFile || mongoose.model('PlayniteDropFile', schema);

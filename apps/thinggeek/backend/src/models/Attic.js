/**
 * The Attic's models, from the shared factories in
 * @geeksuite/schemas/thinggeek/atticModels (the gateway builds the same
 * ones). This backend writes: attic_files, attic_vault_credentials,
 * attic_vault_sessions, attic_audit, and on attic_documents ONLY `secrets`
 * (sealed identifiers) and `files[]` pushes (DOCS/THINGGEEK_PLAN.md
 * "The Attic" → "Who writes what"). Everything else is the gateway's.
 */
import mongoose from 'mongoose';
import atticModels from '@geeksuite/schemas/thinggeek/atticModels';

const {
  ATTIC_COLLECTIONS: C,
  createAtticPersonSchema,
  createAtticDocumentTypeSchema,
  createAtticDocumentSchema,
  createAtticFileSchema,
  createVaultCredentialSchema,
  createVaultSessionSchema,
  createAtticAuditSchema,
} = atticModels;

const model = (name, factory, collection) => mongoose.models[name] || mongoose.model(name, factory(mongoose), collection);

export const AtticPerson = model('AtticPerson', createAtticPersonSchema, C.people);
export const AtticDocumentType = model('AtticDocumentType', createAtticDocumentTypeSchema, C.documentTypes);
export const AtticDocument = model('AtticDocument', createAtticDocumentSchema, C.documents);
export const AtticFile = model('AtticFile', createAtticFileSchema, C.files);
export const VaultCredential = model('VaultCredential', createVaultCredentialSchema, C.credentials);
export const VaultSession = model('VaultSession', createVaultSessionSchema, C.sessions);
export const AtticAudit = model('AtticAudit', createAtticAuditSchema, C.audit);

export default { AtticPerson, AtticDocumentType, AtticDocument, AtticFile, VaultCredential, VaultSession, AtticAudit };

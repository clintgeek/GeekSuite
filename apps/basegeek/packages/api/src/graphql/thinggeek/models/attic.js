import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// The Attic's collections on the thinggeek database. Shared definitions
// (fields + indexes) in @geeksuite/schemas/thinggeek/atticModels — the same
// ones the thinggeek backend uses; add fields there, never here.
//
// The gateway holds NO vault key: it never reads or writes `secrets` values
// or file bytes (DOCS/THINGGEEK_PLAN.md "The Attic").
import atticModels from '@geeksuite/schemas/thinggeek/atticModels';

const {
  ATTIC_COLLECTIONS: C,
  createAtticPersonSchema,
  createAtticDocumentTypeSchema,
  createAtticDocumentSchema,
  createAtticFileSchema,
  createVaultSessionSchema,
  createAtticAuditSchema,
} = atticModels;

const conn = getAppConnection('thinggeek');
const model = (name, factory, collection) => conn.models[name] || conn.model(name, factory(mongoose), collection);

export const AtticPerson = model('AtticPerson', createAtticPersonSchema, C.people);
export const AtticDocumentType = model('AtticDocumentType', createAtticDocumentTypeSchema, C.documentTypes);
export const AtticDocument = model('AtticDocument', createAtticDocumentSchema, C.documents);
export const AtticFile = model('AtticFile', createAtticFileSchema, C.files);
export const VaultSession = model('VaultSession', createVaultSessionSchema, C.sessions);
export const AtticAudit = model('AtticAudit', createAtticAuditSchema, C.audit);

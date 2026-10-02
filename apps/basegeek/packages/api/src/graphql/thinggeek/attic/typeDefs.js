import { gql } from 'graphql-tag';

// The Attic — ThingGeek's locked unit for family documents
// (DOCS/THINGGEEK_PLAN.md "The Attic").
//
// Every resolver: requireUser + the MEMBER GATE (resolveHouseholdId), then
// — for everything but the two LOCKED-VISIBLE answers below — a live VAULT
// SESSION for this user (VAULT_LOCKED otherwise). The session is the
// `thinggeek_vault` cookie the thinggeek backend sets on an unlock; this
// gateway only checks it against attic_vault_sessions (no secret needed).
//
// LOCKED-VISIBLE, by design and nothing else:
//   - atticExpiring / ThingAttention.attic: person names + document type +
//     expiry date of documents inside their type's warning window (no title,
//     no numbers, no images, no notes);
//   - Thing.attic.count: how many Attic documents link to a thing.
//
// This gateway holds NO vault key. Identifier values (passport numbers…)
// are never returned here: `identifiers` says only whether one is on file.
// Values and file bytes come from the backend (/api/attic/…), decrypted
// there, audit-logged, served `Cache-Control: no-store`.
export const typeDefs = gql`
  type AtticDocumentTypeField {
    key: String!
    label: String!
    kind: String!          # text | number | date | choice | url
    choices: [String!]!
    identifier: Boolean!   # encrypted at rest, masked, every reveal audit-logged
    strict: Boolean!       # masked hardest (the Social Security number)
    required: Boolean!
  }

  type AtticDocumentType {
    id: ID!
    key: String!
    name: String!
    icon: String!
    issuedLabel: String    # null: this type has no issued date
    expiryLabel: String    # null: this type has no expiry date ("Renews" for a policy)
    expiryWarnDays: Int    # null: never warns
    fields: [AtticDocumentTypeField!]!
    builtIn: Boolean!
    documentCount: Int!
  }

  type AtticPerson {
    id: ID!
    name: String!
    relation: String
    birthDate: Date
    documentCount: Int!
  }

  # A plain (non-identifier) field, rendered against the type in field order.
  type AtticField {
    key: String!
    label: String!
    kind: String!
    value: JSON
  }

  # An identifier field: whether a value is on file — never the value.
  type AtticIdentifier {
    key: String!
    label: String!
    strict: Boolean!
    hasValue: Boolean!
  }

  type AtticDocumentFile {
    id: ID!
    fileId: ID!
    side: String!          # front | back | page
    caption: String
    url: String!           # /api/attic/files/:fileId — vault-gated, no-store
    mime: String
    size: Int
    width: Int
    height: Int
  }

  type AtticExpiry {
    date: Date
    label: String          # the type's expiryLabel
    status: String!        # none | ok | warning | expired
    daysUntil: Int
    warnDays: Int
    warnsOn: Date
  }

  type AtticDocument {
    id: ID!
    title: String!         # the stored title, else "<type> · <people>"
    type: AtticDocumentType
    people: [AtticPerson!]!
    fields: [AtticField!]!
    identifiers: [AtticIdentifier!]!
    issued: Date
    expires: Date
    expiry: AtticExpiry!
    files: [AtticDocumentFile!]!
    links: [ThingSummary!]!   # live things in this household
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  # LOCKED-VISIBLE: what Needs attention may show without an unlock.
  type AtticExpiring {
    documentId: ID!
    typeName: String!
    expiryLabel: String!
    people: [String!]!
    expires: Date!
    daysUntil: Int!
    status: String!        # warning | expired
  }

  type AtticAccessEntry {
    id: ID!
    at: Date!
    action: String!
    actorName: String!
    method: String
    documentId: ID
    documentTitle: String  # null when the document is gone
    field: String          # the field LABEL a reveal opened — never its value
  }

  # On a thing's page. Locked: just the count ("2 documents in the Attic").
  type ThingAttic {
    count: Int!
    locked: Boolean!
    documents: [AtticDocument!]!   # empty while locked
  }

  extend type Thing {
    attic: ThingAttic!
  }

  extend type ThingAttention {
    attic: [AtticExpiring!]!
  }

  input AtticPersonInput {
    name: String
    relation: String
    birthDate: Date
  }

  input AtticDocumentTypeFieldInput {
    key: String!
    label: String!
    kind: String!
    choices: [String!]
    identifier: Boolean
    strict: Boolean
    required: Boolean
  }

  input AtticDocumentTypeInput {
    name: String
    icon: String
    issuedLabel: String
    expiryLabel: String
    expiryWarnDays: Int
    fields: [AtticDocumentTypeFieldInput!]
  }

  # Edits/reorders/removes EXISTING files (uploads go to the backend).
  input AtticDocumentFileInput {
    id: ID!
    side: String
    caption: String
  }

  # On update every field is optional; omitted = unchanged; arrays replace
  # whole. typeId is fixed after create. \`fields\` takes only the type's
  # NON-identifier keys — identifier values go to the backend, encrypted.
  input AtticDocumentInput {
    typeId: ID
    personIds: [ID!]
    title: String
    fields: JSON
    issued: Date
    expires: Date
    files: [AtticDocumentFileInput!]
    links: [ID!]           # thing ids
    notes: String
  }

  extend type Query {
    atticPeople: [AtticPerson!]!
    # Seeds the starter document types on first call for the household.
    atticDocumentTypes: [AtticDocumentType!]!
    atticDocuments(personId: ID, typeId: ID): [AtticDocument!]!
    # Audit-logged as a view.
    atticDocument(id: ID!): AtticDocument
    atticAccessLog(limit: Int = 40): [AtticAccessEntry!]!
    # LOCKED-VISIBLE (see the header).
    atticExpiring: [AtticExpiring!]!
  }

  extend type Mutation {
    createAtticPerson(input: AtticPersonInput!): AtticPerson!
    updateAtticPerson(id: ID!, input: AtticPersonInput!): AtticPerson!
    # Refused (CONFLICT) while any document names the person.
    deleteAtticPerson(id: ID!): DeleteResponse!
    createAtticDocumentType(input: AtticDocumentTypeInput!): AtticDocumentType!
    updateAtticDocumentType(id: ID!, input: AtticDocumentTypeInput!): AtticDocumentType!
    # Refused (CONFLICT) while any document uses the type.
    deleteAtticDocumentType(id: ID!): DeleteResponse!
    createAtticDocument(input: AtticDocumentInput!): AtticDocument!
    updateAtticDocument(id: ID!, input: AtticDocumentInput!): AtticDocument!
    # Gone from every view at once; the backend purges it and its files.
    deleteAtticDocument(id: ID!): DeleteResponse!
  }
`;

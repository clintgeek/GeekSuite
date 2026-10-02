/**
 * The Attic's GraphQL documents (gateway: graphql/thinggeek/attic/). The
 * gateway never returns an identifier VALUE — `identifiers` says only
 * whether one is on file; values come from the backend (api/attic.js).
 *
 * Locked-visible: GET_ATTIC_EXPIRING and Thing.attic.count. Everything else
 * answers VAULT_LOCKED until the vault is open.
 */
import { gql } from '@apollo/client';

export const ATTIC_TYPE_FIELDS = gql`
  fragment AtticTypeFields on AtticDocumentType {
    id
    key
    name
    icon
    issuedLabel
    expiryLabel
    expiryWarnDays
    builtIn
    documentCount
    fields {
      key
      label
      kind
      choices
      identifier
      strict
      required
    }
  }
`;

export const ATTIC_PERSON_FIELDS = gql`
  fragment AtticPersonFields on AtticPerson {
    id
    name
    relation
    birthDate
    documentCount
  }
`;

export const ATTIC_DOC_SUMMARY = gql`
  fragment AtticDocSummary on AtticDocument {
    id
    title
    type {
      id
      key
      name
      icon
    }
    people {
      id
      name
    }
    expires
    expiry {
      status
      daysUntil
      label
    }
    files {
      id
    }
  }
`;

export const ATTIC_DOC_FIELDS = gql`
  fragment AtticDocFields on AtticDocument {
    id
    title
    type {
      ...AtticTypeFields
    }
    people {
      id
      name
    }
    fields {
      key
      label
      kind
      value
    }
    identifiers {
      key
      label
      strict
      hasValue
    }
    issued
    expires
    expiry {
      status
      daysUntil
      label
      warnDays
      warnsOn
    }
    files {
      id
      fileId
      side
      caption
      url
      mime
      size
      width
      height
    }
    links {
      id
      name
      type {
        id
        icon
        name
      }
    }
    notes
    createdAt
    updatedAt
  }
  ${ATTIC_TYPE_FIELDS}
`;

export const GET_ATTIC_HOME = gql`
  query GetAtticHome {
    atticPeople {
      ...AtticPersonFields
    }
    atticDocumentTypes {
      ...AtticTypeFields
    }
    atticDocuments {
      ...AtticDocSummary
    }
  }
  ${ATTIC_PERSON_FIELDS}
  ${ATTIC_TYPE_FIELDS}
  ${ATTIC_DOC_SUMMARY}
`;

export const GET_ATTIC_DOCUMENT = gql`
  query GetAtticDocument($id: ID!) {
    atticDocument(id: $id) {
      ...AtticDocFields
    }
  }
  ${ATTIC_DOC_FIELDS}
`;

export const GET_ATTIC_ACCESS_LOG = gql`
  query GetAtticAccessLog($limit: Int) {
    atticAccessLog(limit: $limit) {
      id
      at
      action
      actorName
      method
      documentId
      documentTitle
      field
    }
  }
`;

/** LOCKED-VISIBLE: who, which document type, and the date. */
export const GET_ATTIC_EXPIRING = gql`
  query GetAtticExpiring {
    atticExpiring {
      documentId
      typeName
      expiryLabel
      people
      expires
      daysUntil
      status
    }
  }
`;

/** A thing's page: the count is locked-visible; the documents need the vault. */
export const GET_THING_ATTIC = gql`
  query GetThingAttic($id: ID!) {
    thing(id: $id) {
      id
      attic {
        count
        locked
        documents {
          ...AtticDocSummary
        }
      }
    }
  }
  ${ATTIC_DOC_SUMMARY}
`;

export const CREATE_ATTIC_PERSON = gql`
  mutation CreateAtticPerson($input: AtticPersonInput!) {
    createAtticPerson(input: $input) {
      ...AtticPersonFields
    }
  }
  ${ATTIC_PERSON_FIELDS}
`;

export const UPDATE_ATTIC_PERSON = gql`
  mutation UpdateAtticPerson($id: ID!, $input: AtticPersonInput!) {
    updateAtticPerson(id: $id, input: $input) {
      ...AtticPersonFields
    }
  }
  ${ATTIC_PERSON_FIELDS}
`;

export const DELETE_ATTIC_PERSON = gql`
  mutation DeleteAtticPerson($id: ID!) {
    deleteAtticPerson(id: $id) {
      success
      message
    }
  }
`;

export const CREATE_ATTIC_TYPE = gql`
  mutation CreateAtticDocumentType($input: AtticDocumentTypeInput!) {
    createAtticDocumentType(input: $input) {
      ...AtticTypeFields
    }
  }
  ${ATTIC_TYPE_FIELDS}
`;

export const UPDATE_ATTIC_TYPE = gql`
  mutation UpdateAtticDocumentType($id: ID!, $input: AtticDocumentTypeInput!) {
    updateAtticDocumentType(id: $id, input: $input) {
      ...AtticTypeFields
    }
  }
  ${ATTIC_TYPE_FIELDS}
`;

export const CREATE_ATTIC_DOCUMENT = gql`
  mutation CreateAtticDocument($input: AtticDocumentInput!) {
    createAtticDocument(input: $input) {
      ...AtticDocFields
    }
  }
  ${ATTIC_DOC_FIELDS}
`;

export const UPDATE_ATTIC_DOCUMENT = gql`
  mutation UpdateAtticDocument($id: ID!, $input: AtticDocumentInput!) {
    updateAtticDocument(id: $id, input: $input) {
      ...AtticDocFields
    }
  }
  ${ATTIC_DOC_FIELDS}
`;

export const DELETE_ATTIC_DOCUMENT = gql`
  mutation DeleteAtticDocument($id: ID!) {
    deleteAtticDocument(id: $id) {
      success
      message
    }
  }
`;

/** Root fields evicted from the Apollo cache on Lock: nothing of the Attic outlives the session in memory. */
export const ATTIC_ROOT_FIELDS = ['atticPeople', 'atticDocumentTypes', 'atticDocuments', 'atticDocument', 'atticAccessLog'];

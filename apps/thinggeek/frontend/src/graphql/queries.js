import { gql } from '@apollo/client';

// Every field here exists in
// apps/basegeek/packages/api/src/graphql/thinggeek/typeDefs.js; CI's
// tools/gql-arg-audit.mjs cross-checks the arguments against it.

export const THING_TYPE_FIELDS = gql`
  fragment ThingTypeFields on ThingType {
    id
    key
    name
    icon
    kind
    builtIn
    thingCount
    fields {
      key
      label
      kind
      choices
      unit
      identifier
      required
    }
  }
`;

/** One row of the containment tree (the Where page, the pickers, the Where facet's labels). */
export const THING_NODE_FIELDS = gql`
  fragment ThingNodeFields on ThingNode {
    id
    name
    parentId
    parentInTrash
    kind
    childCount
    itemCount
    type {
      id
      name
      icon
    }
  }
`;

/** What a card or a list row needs. The detail fragment is a strict superset. */
export const THING_CARD_FIELDS = gql`
  fragment ThingCardFields on Thing {
    id
    name
    tags
    missing
    createdAt
    updatedAt
    kind
    parentId
    type {
      id
      key
      name
      icon
      kind
    }
    # Where it is: root → parent (House › Garage › Van).
    path {
      id
      name
      kind
      inTrash
    }
    coverPhoto {
      id
      role
      url
      thumbUrl
    }
    nextDue {
      id
      kind
      label
      date
      occursOn
      daysUntil
      status
    }
    value {
      amount
      currency
      asOf
    }
    acquired {
      date
      from
      price {
        amount
        currency
      }
    }
  }
`;

export const THING_DETAIL_FIELDS = gql`
  fragment ThingDetailFields on Thing {
    ...ThingCardFields
    attributes
    notes
    deletedAt
    fields {
      key
      label
      kind
      unit
      identifier
      value
    }
    dates {
      id
      kind
      label
      date
      occursOn
      recurEveryMonths
      notes
      daysUntil
      status
    }
    photos {
      id
      fileId
      role
      caption
      url
      thumbUrl
      width
      height
    }
    documents {
      id
      fileId
      role
      title
      url
      mime
      size
      originalName
    }
    relationships {
      id
      kind
      direction
      thing {
        id
        name
        coverThumbUrl
        type {
          id
          name
          icon
        }
      }
    }
  }
  ${THING_CARD_FIELDS}
`;

export const GET_THINGS = gql`
  query GetThings($page: Int, $limit: Int, $filter: ThingFilterInput, $sort: String, $sortDir: String, $seed: Int) {
    things(page: $page, limit: $limit, filter: $filter, sort: $sort, sortDir: $sortDir, seed: $seed) {
      total
      page
      pages
      things {
        ...ThingCardFields
      }
    }
  }
  ${THING_CARD_FIELDS}
`;

/**
 * The insurance report and its CSV: every field, walked page by page. Its
 * own operation (and `no-cache` at the call site) so a 100-row export never
 * lands in the library's paged-list cache.
 */
export const GET_REPORT_THINGS = gql`
  query GetReportThings($page: Int, $limit: Int, $filter: ThingFilterInput, $sort: String, $sortDir: String) {
    things(page: $page, limit: $limit, filter: $filter, sort: $sort, sortDir: $sortDir) {
      total
      page
      pages
      things {
        ...ThingDetailFields
      }
    }
  }
  ${THING_DETAIL_FIELDS}
`;

export const GET_THING_FACETS = gql`
  query GetThingFacets($filter: ThingFilterInput) {
    thingFacets(filter: $filter) {
      total
      types {
        value
        count
      }
      tags {
        value
        count
      }
      where {
        value
        count
      }
      kinds {
        value
        count
      }
      due {
        value
        count
      }
      missing {
        value
        count
      }
      acquiredYears {
        year
        count
      }
      hasPhotos
      hasDocuments
    }
  }
`;

/** The thing page: the detail fragment, plus what is directly inside it (Contains). */
export const GET_THING = gql`
  query GetThing($id: ID!) {
    thing(id: $id) {
      ...ThingDetailFields
      contentsCount
      contents {
        ...ThingCardFields
      }
    }
  }
  ${THING_DETAIL_FIELDS}
`;

export const GET_THING_TYPES = gql`
  query GetThingTypes {
    thingTypes {
      ...ThingTypeFields
    }
  }
  ${THING_TYPE_FIELDS}
`;

export const GET_THING_TREE = gql`
  query GetThingTree {
    thingTree {
      ...ThingNodeFields
    }
  }
  ${THING_NODE_FIELDS}
`;

export const GET_THING_ATTENTION = gql`
  query GetThingAttention {
    thingAttention {
      overdue {
        ...ThingCardFields
      }
      dueSoon {
        ...ThingCardFields
      }
      missingIdPlate
      missingReceipt
      missingSerial
      missingValue
      missingPhoto
    }
  }
  ${THING_CARD_FIELDS}
`;

export const GET_THING_PROFILE = gql`
  query GetThingProfile {
    thingProfile {
      savedFilters {
        id
        name
        filter
        sortBy
        sortDir
      }
    }
  }
`;

export const GET_THING_VOCABULARY = gql`
  query GetThingVocabulary {
    thingVocabulary {
      fieldKinds
      dateKinds
      photoRoles
      documentRoles
      relationshipKinds
      thingKinds
      missingKeys
      trashDays
    }
  }
`;

export const GET_TRASHED_THINGS = gql`
  query GetTrashedThings {
    trashedThings {
      ...ThingCardFields
      deletedAt
    }
  }
  ${THING_CARD_FIELDS}
`;

export const GET_THING_INSURANCE_TOTALS = gql`
  query GetThingInsuranceTotals($filter: ThingFilterInput) {
    thingInsuranceTotals(filter: $filter) {
      count
      totalValue
      currency
      withSerial
      withReceipt
      withPhoto
    }
  }
`;

/** The relationship editor's picker: names only, searched on the server (inventory only — no location is an accessory). */
export const SEARCH_THINGS = gql`
  query SearchThings($filter: ThingFilterInput, $limit: Int) {
    things(page: 1, limit: $limit, filter: $filter, sort: "name", sortDir: "asc") {
      total
      things {
        id
        name
        type {
          id
          name
          icon
        }
        coverPhoto {
          id
          thumbUrl
        }
      }
    }
  }
`;

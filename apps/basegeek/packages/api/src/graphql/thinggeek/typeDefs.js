import { gql } from 'graphql-tag';

// ThingGeek — the household inventory. Design: DOCS/THINGGEEK_PLAN.md.
//
// EVERY resolver starts with requireUser + resolveHouseholdId from
// @geeksuite/schemas/thinggeek/household, which also enforces the MEMBER
// GATE (only the accounts Chef named; others get NOT_A_MEMBER). Nothing here
// accepts a householdId from the client. Deleted things (deletedAt set) are
// excluded everywhere except trashedThings (and a thing's path, where an
// ancestor in the Trash shows as inTrash).
//
// WHERE a thing is: its parentId, pointing at another Thing ("Containment" in
// the plan). A type's kind decides the role: location (house, room, shelf —
// never inventory), container (van, safe — inventory AND a place), item.
export const typeDefs = gql`
  type ThingMoney {
    amount: Float
    currency: String!
  }

  type ThingTypeField {
    key: String!
    label: String!
    kind: String!          # text | number | date | choice | money | url | boolean
    choices: [String!]!
    unit: String
    identifier: Boolean!   # serial / VIN / hull / registration: masked in the UI, never sent to AI
    required: Boolean!
  }

  type ThingType {
    id: ID!
    key: String!
    name: String!
    icon: String!
    kind: String!          # location | container | item
    fields: [ThingTypeField!]!
    builtIn: Boolean!
    thingCount: Int!
  }

  type ThingDate {
    id: ID!
    kind: String!          # warranty | registration | insurance | license | maintenance | other
    label: String
    date: Date!            # calendar date (UTC midnight)
    recurEveryMonths: Int
    notes: String
    # The occurrence that counts: the anchor for a one-off date; for a
    # recurring one, the next anchor + k·recurEveryMonths on/after today.
    # Show THIS as "due on", not \`date\` (the stored anchor, kept for editing).
    occursOn: Date
    # Whole days from today (UTC calendar) to occursOn — negative when past.
    daysUntil: Int!
    status: String!        # overdue | soon (≤30d) | upcoming (≤90d) | later
  }

  type ThingAttribute {
    key: String!
    label: String!
    kind: String!
    unit: String
    identifier: Boolean!
    value: JSON            # household members see the real value; the UI masks identifiers until revealed
  }

  type ThingPhoto {
    id: ID!
    fileId: ID!
    role: String!          # overview | id-plate | receipt | detail | other
    caption: String
    url: String!           # served by the thinggeek backend, auth + member gated
    thumbUrl: String
    width: Int
    height: Int
  }

  type ThingDocument {
    id: ID!
    fileId: ID!
    role: String!          # receipt | manual | warranty | registration | insurance | other
    title: String
    url: String!
    mime: String
    size: Int
    originalName: String
  }

  type ThingSummary {
    id: ID!
    name: String!
    type: ThingType
    kind: String!          # its type's kind; item when it has none
    coverThumbUrl: String
    inTrash: Boolean!      # only ever true on a path crumb
  }

  type ThingRelationship {
    id: ID!
    kind: String!          # accessory-of
    # out = stored on this thing ("the lens is an accessory of the camera");
    # in  = derived from another thing pointing here ("the camera's accessories").
    direction: String!
    thing: ThingSummary!
  }

  type ThingAcquired {
    date: Date
    from: String
    price: ThingMoney
  }

  type ThingValue {
    amount: Float
    currency: String!
    asOf: Date
  }

  type Thing {
    id: ID!
    name: String!
    type: ThingType
    kind: String!          # its type's kind; item when it has none
    tags: [String!]!
    # Where it is: the thing it is directly inside (null = the top level).
    parentId: ID
    # Root → parent: [House, Garage, Van] for the jumper cables. An ancestor
    # in the Trash stays in the path, inTrash: true ("inside something in the
    # Trash"); restoring it needs nothing else.
    path: [ThingSummary!]!
    # What is directly inside it (live things): locations, containers, then
    # items, each by name.
    contents: [Thing!]!
    contentsCount: Int!
    acquired: ThingAcquired!
    value: ThingValue!
    dates: [ThingDate!]!
    nextDue: ThingDate
    # Raw attribute map, plus the same rendered against the type's fields (in field order).
    attributes: JSON!
    fields: [ThingAttribute!]!
    photos: [ThingPhoto!]!
    coverPhoto: ThingPhoto
    documents: [ThingDocument!]!
    relationships: [ThingRelationship!]!
    notes: String
    # Computed gaps: photo | id-plate | receipt | serial | value (serial = an identifier field is empty).
    # Always empty for a location: it is not inventory.
    missing: [String!]!
    deletedAt: Date
    createdAt: Date
    updatedAt: Date
  }

  type ThingPage {
    things: [Thing!]!
    total: Int!
    page: Int!
    pages: Int!
  }

  type ThingFacetValue { value: String!  count: Int! }

  # One row of the containment tree (every live thing in the household).
  type ThingNode {
    id: ID!
    name: String!
    parentId: ID           # as stored: may name a thing in the Trash (parentInTrash)
    parentInTrash: Boolean!
    kind: String!
    type: ThingType
    childCount: Int!       # live things directly inside
    itemCount: Int!        # live inventory (not locations) anywhere inside
  }
  type ThingYearBucket { year: Int!  count: Int! }

  type ThingFacets {
    total: Int!
    types: [ThingFacetValue!]!       # value = type id
    tags: [ThingFacetValue!]!
    where: [ThingFacetValue!]!       # value = a location's or container's id; counts include everything inside
    kinds: [ThingFacetValue!]!       # location | container | item (fixed order)
    due: [ThingFacetValue!]!         # overdue | 30d | 90d | year (fixed order)
    missing: [ThingFacetValue!]!     # photo | id-plate | receipt | serial | value (fixed order)
    acquiredYears: [ThingYearBucket!]!
    hasPhotos: Int!
    hasDocuments: Int!
  }

  type ThingAttention {
    overdue: [Thing!]!
    dueSoon: [Thing!]!               # next 30 days
    missingIdPlate: Int!
    missingReceipt: Int!
    missingSerial: Int!
    missingValue: Int!
    missingPhoto: Int!
  }

  type ThingSavedFilter {
    id: ID!
    name: String!
    filter: JSON
    sortBy: String
    sortDir: String
  }

  type ThingProfile {
    savedFilters: [ThingSavedFilter!]!
  }

  type ThingInsuranceTotals {
    count: Int!
    totalValue: Float!
    currency: String!
    withSerial: Int!
    withReceipt: Int!
    withPhoto: Int!
  }

  type ThingVocabulary {
    fieldKinds: [String!]!
    dateKinds: [String!]!
    photoRoles: [String!]!
    documentRoles: [String!]!
    relationshipKinds: [String!]!
    thingKinds: [String!]!
    missingKeys: [String!]!
    trashDays: Int!
  }

  input ThingMoneyInput { amount: Float  currency: String }
  input ThingAcquiredInput { date: Date  from: String  price: ThingMoneyInput }
  input ThingValueInput { amount: Float  currency: String  asOf: Date }
  input ThingDateInput { id: ID  kind: String!  label: String  date: Date!  recurEveryMonths: Int  notes: String }
  input ThingPhotoInput { id: ID!  role: String  caption: String }      # edits/reorders EXISTING photos (uploads go to the backend)
  input ThingDocumentInput { id: ID!  role: String  title: String }
  input ThingRelationshipInput { kind: String!  thingId: ID! }

  # On update every field is optional; omitted = unchanged. Arrays replace whole.
  input ThingInput {
    name: String
    typeId: ID
    tags: [String!]
    # Move: any live thing in the household but itself or something inside
    # it, at most bounds.containDepth deep; null = the top level.
    parentId: ID
    acquired: ThingAcquiredInput
    value: ThingValueInput
    dates: [ThingDateInput!]
    attributes: JSON       # validated against the type's fields
    photos: [ThingPhotoInput!]
    documents: [ThingDocumentInput!]
    relationships: [ThingRelationshipInput!]
    notes: String
  }

  input ThingTypeFieldInput {
    key: String!
    label: String!
    kind: String!
    choices: [String!]
    unit: String
    identifier: Boolean
    required: Boolean
  }

  input ThingTypeInput {
    name: String
    icon: String
    kind: String           # location | container | item (create default: item)
    fields: [ThingTypeFieldInput!]
  }

  # The search box's tokens (type:, tag:, in:, before:, after:, expiring:, due:,
  # missing:, has:) are parsed SERVER-SIDE out of q, so AI/MCP later get the
  # same grammar. The structured fields AND with whatever q's tokens say.
  input ThingFilterInput {
    q: String
    types: [ID!]
    tags: [String!]
    tagMatch: String       # any (default) | all
    within: [ID!]          # inside any of these things, at any depth
    # location | container | item. Omitted = container + item: locations are
    # not inventory (unless a location type is asked for by types/type:).
    kinds: [String!]
    due: [String!]         # overdue | 30d | 90d | year
    missing: [String!]
    hasPhotos: Boolean
    hasDocuments: Boolean
    acquiredYearMin: Int
    acquiredYearMax: Int
    valueMin: Float
    valueMax: Float
  }

  input ThingSavedFilterInput {
    id: ID
    name: String!
    filter: JSON
    sortBy: String
    sortDir: String
  }

  extend type Query {
    # sort: name | recentlyAdded | acquired | value | nextDue | random. sortDir: asc | desc.
    things(page: Int = 1, limit: Int = 48, filter: ThingFilterInput, sort: String = "name", sortDir: String = "asc", seed: Int): ThingPage!
    thing(id: ID!): Thing
    thingFacets(filter: ThingFilterInput): ThingFacets!
    # Seeds the starter types on first call for the household.
    thingTypes: [ThingType!]!
    # The whole containment tree: every live thing, depth-first, siblings by name.
    thingTree: [ThingNode!]!
    thingAttention: ThingAttention!
    thingProfile: ThingProfile!
    thingVocabulary: ThingVocabulary!
    trashedThings: [Thing!]!
    thingInsuranceTotals(filter: ThingFilterInput): ThingInsuranceTotals!
  }

  extend type Mutation {
    createThing(input: ThingInput!): Thing!
    updateThing(id: ID!, input: ThingInput!): Thing!
    # Soft delete → Trash for trashDays; what is inside it stays put. restoreThing brings it back.
    deleteThing(id: ID!): DeleteResponse!
    restoreThing(id: ID!): Thing!
    createThingType(input: ThingTypeInput!): ThingType!
    # kind → item is refused (CONFLICT) while any of its things contain things.
    updateThingType(id: ID!, input: ThingTypeInput!): ThingType!
    # Refused while any (non-trashed) thing uses the type.
    deleteThingType(id: ID!): DeleteResponse!
    saveThingFilter(input: ThingSavedFilterInput!): ThingProfile!
    deleteThingFilter(id: ID!): ThingProfile!
  }
`;

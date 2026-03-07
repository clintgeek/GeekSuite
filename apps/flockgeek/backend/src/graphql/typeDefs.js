import { gql } from 'graphql-tag';

export const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  #
  # Types
  #

  type Bird @key(fields: "id") {
    id: ID!
    ownerId: String!
    name: String
    tagId: String!
    species: String
    breed: String
    strain: String
    cross: Boolean
    sex: String
    hatchDate: String
    origin: String
    foundationStock: Boolean
    pairingId: ID
    locationId: ID
    temperamentScore: Int
    weightGrams: Float
    weightDate: String
    healthScore: Int
    status: String
    statusDate: String
    statusReason: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type BirdTrait @key(fields: "id") {
    id: ID!
    ownerId: String!
    birdId: ID!
    loggedAt: String!
    weightGrams: Float
    featherColor: String
    pattern: String
    combType: String
    legColor: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type BirdNote @key(fields: "id") {
    id: ID!
    ownerId: String!
    birdId: ID!
    loggedAt: String!
    content: String!
    category: String
    createdAt: String
    updatedAt: String
  }

  type HealthRecord @key(fields: "id") {
    id: ID!
    ownerId: String!
    birdId: ID!
    eventDate: String!
    type: String!
    diagnosis: String
    treatment: String
    outcome: String
    cullReason: String
    vet: String
    costCents: Int
    notes: String
    createdAt: String
    updatedAt: String
  }

  type EggProduction @key(fields: "id") {
    id: ID!
    ownerId: String!
    birdId: ID
    groupId: ID
    locationId: ID
    date: String!
    eggsCount: Int!
    avgEggWeightGrams: Float
    eggColor: String
    eggSize: String
    source: String
    quality: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type MortalityRecord {
    day: Int
    count: Int
  }

  type HatchEvent @key(fields: "id") {
    id: ID!
    ownerId: String!
    pairingId: ID!
    purpose: String
    broodGroupId: ID
    meatRunId: ID
    setDate: String!
    hatchDate: String
    eggsSet: Int
    eggsFertile: Int
    chicksHatched: Int
    pullets: Int
    cockerels: Int
    mortalityByDay: [MortalityRecord]
    notes: String
    createdAt: String
    updatedAt: String
  }

  type Pairing @key(fields: "id") {
    id: ID!
    ownerId: String!
    name: String!
    roosterIds: [ID]
    henIds: [ID]
    henGroupId: ID
    season: String
    seasonYear: Int
    startDate: String
    endDate: String
    goals: [String]
    active: Boolean
    notes: String
    createdAt: String
    updatedAt: String
  }

  type Group @key(fields: "id") {
    id: ID!
    ownerId: String!
    name: String!
    pairingId: ID
    hatchEventId: ID
    hatchDate: String
    startDate: String!
    endDate: String
    description: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type GroupMembership @key(fields: "id") {
    id: ID!
    ownerId: String!
    groupId: ID!
    birdId: ID!
    joinedAt: String!
    leftAt: String
    role: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type Location @key(fields: "id") {
    id: ID!
    ownerId: String!
    name: String!
    type: String!
    capacity: Int
    cleaningIntervalDays: Int
    lastCleanedAt: String
    isActive: Boolean
    notes: String
    createdAt: String
    updatedAt: String
  }

  type Event @key(fields: "id") {
    id: ID!
    ownerId: String!
    type: String!
    entityType: String
    entityId: ID
    occurredAt: String!
    notes: String
    createdAt: String
    updatedAt: String
  }

  type AncestorRecord {
    ancestorId: ID
    depth: Int
  }

  type LineageCache @key(fields: "birdId") {
    ownerId: String!
    birdId: ID!
    ancestors: [AncestorRecord]
    coefficientOfRelationship: Float
    updatedAt: String
  }

  type MeatRun @key(fields: "id") {
    id: ID!
    ownerId: String!
    pairingId: ID!
    hatchEventId: ID
    name: String
    startDate: String!
    harvestDate: String
    startCount: Int!
    harvestCount: Int
    mortalityCount: Int
    mortalityNotes: String
    avgWeightGrams: Float
    totalWeightGrams: Float
    avgQualityScore: Float
    qualityNotes: String
    feedCostCents: Int
    otherCostsCents: Int
    status: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  #
  # Queries
  #

  extend type Query {
    birds(status: String): [Bird!]!
    bird(id: ID!): Bird

    birdTraits(birdId: ID!): [BirdTrait!]!
    birdNotes(birdId: ID!): [BirdNote!]!
    healthRecords(birdId: ID!): [HealthRecord!]!

    eggProductions(startDate: String, endDate: String, birdId: ID, groupId: ID): [EggProduction!]!

    hatchEvents(activeOnly: Boolean): [HatchEvent!]!
    hatchEvent(id: ID!): HatchEvent

    pairings(activeOnly: Boolean): [Pairing!]!
    pairing(id: ID!): Pairing

    groups(activeOnly: Boolean): [Group!]!
    group(id: ID!): Group

    locations(activeOnly: Boolean): [Location!]!

    meatRuns(status: String): [MeatRun!]!
    meatRun(id: ID!): MeatRun

    events(entityType: String, entityId: ID): [Event!]!
  }

  #
  # Mutations
  #

  extend type Mutation {
    # Birds
    createBird(
      name: String,
      tagId: String!,
      species: String,
      breed: String,
      sex: String,
      status: String,
      notes: String,
      hatchDate: String,
      origin: String
    ): Bird!

    updateBird(
      id: ID!,
      name: String,
      tagId: String,
      status: String,
      notes: String,
      locationId: ID,
      sex: String
    ): Bird!

    # Production
    recordEggProduction(
      birdId: ID,
      groupId: ID,
      locationId: ID,
      date: String!,
      eggsCount: Int!,
      avgEggWeightGrams: Float,
      eggColor: String,
      eggSize: String,
      notes: String
    ): EggProduction!

    updateEggProduction(
      id: ID!,
      date: String,
      eggsCount: Int,
      locationId: ID,
      notes: String
    ): EggProduction!

    # Pairings
    createPairing(
      name: String!,
      roosterIds: [ID],
      henIds: [ID],
      pairingDate: String,
      active: Boolean,
      notes: String
    ): Pairing!

    updatePairing(
      id: ID!,
      name: String,
      roosterIds: [ID],
      henIds: [ID],
      pairingDate: String,
      active: Boolean,
      notes: String
    ): Pairing!

    # Hatch Events
    recordHatchEvent(
      setDate: String!,
      hatchDate: String,
      eggsSet: Int!,
      notes: String
    ): HatchEvent!

    updateHatchEvent(
      id: ID!,
      setDate: String,
      hatchDate: String,
      eggsSet: Int,
      eggsFertile: Int,
      chicksHatched: Int,
      pullets: Int,
      cockerels: Int,
      notes: String
    ): HatchEvent!

    # Meat Runs
    createMeatRun(
      pairingId: ID!,
      hatchEventId: ID,
      name: String,
      startDate: String!,
      startCount: Int!,
      notes: String
    ): MeatRun!

    updateMeatRun(
      id: ID!,
      harvestDate: String,
      harvestCount: Int,
      mortalityCount: Int,
      avgWeightGrams: Float,
      status: String,
      notes: String
    ): MeatRun!

    # Health
    addHealthRecord(
      birdId: ID!,
      eventDate: String!,
      type: String!,
      diagnosis: String,
      treatment: String,
      outcome: String,
      notes: String
    ): HealthRecord!

    # Miscellaneous
    deleteEntity(type: String!, id: ID!): Boolean!
  }
`;

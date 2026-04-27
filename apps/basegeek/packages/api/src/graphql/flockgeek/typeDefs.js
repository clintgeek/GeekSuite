import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Bird {
    id: ID!
    ownerId: String!
    name: String
    tagId: String!
    species: String
    breed: String
    strain: String
    cross: Boolean
    sex: String
    hatchDate: Date
    origin: String
    foundationStock: Boolean
    pairingId: ID
    locationId: ID
    temperamentScore: Int
    weightGrams: Float
    weightDate: Date
    healthScore: Int
    status: String
    statusDate: Date
    statusReason: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type BirdTrait {
    id: ID!
    ownerId: String!
    birdId: ID!
    loggedAt: Date!
    weightGrams: Float
    featherColor: String
    pattern: String
    combType: String
    legColor: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type BirdNote {
    id: ID!
    ownerId: String!
    birdId: ID!
    loggedAt: Date!
    content: String!
    category: String
    createdAt: Date
    updatedAt: Date
  }

  type HealthRecord {
    id: ID!
    ownerId: String!
    birdId: ID!
    eventDate: Date!
    type: String!
    diagnosis: String
    treatment: String
    outcome: String
    cullReason: String
    vet: String
    costCents: Int
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type EggProduction {
    id: ID!
    ownerId: String!
    birdId: ID
    groupId: ID
    locationId: ID
    date: Date!
    eggsCount: Int!
    daysObserved: Int
    avgEggWeightGrams: Float
    eggColor: String
    eggSize: String
    source: String
    quality: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type MortalityRecord {
    day: Int
    count: Int
  }

  type HatchEvent {
    id: ID!
    ownerId: String!
    pairingId: ID
    purpose: String
    broodGroupId: ID
    meatRunId: ID
    setDate: Date!
    hatchDate: Date
    eggsSet: Int
    eggsFertile: Int
    chicksHatched: Int
    pullets: Int
    cockerels: Int
    mortalityByDay: [MortalityRecord]
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type Pairing {
    id: ID!
    ownerId: String!
    name: String!
    roosterIds: [ID]
    henIds: [ID]
    henGroupId: ID
    season: String
    seasonYear: Int
    startDate: Date
    endDate: Date
    goals: [String]
    active: Boolean
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type FlockGroup {
    id: ID!
    ownerId: String!
    name: String!
    purpose: String
    type: String
    pairingId: ID
    hatchEventId: ID
    hatchDate: Date
    startDate: Date!
    endDate: Date
    description: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type GroupMembership {
    id: ID!
    ownerId: String!
    groupId: ID!
    birdId: ID!
    bird: Bird
    joinedAt: Date!
    leftAt: Date
    role: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type FlockLocation {
    id: ID!
    ownerId: String!
    name: String!
    type: String!
    capacity: Int
    cleaningIntervalDays: Int
    lastCleanedAt: Date
    isActive: Boolean
    description: String
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type FlockEvent {
    id: ID!
    ownerId: String!
    type: String!
    entityType: String
    entityId: ID
    occurredAt: Date!
    notes: String
    createdAt: Date
    updatedAt: Date
  }

  type AncestorRecord {
    ancestorId: ID
    depth: Int
  }

  type LineageCache {
    ownerId: String!
    birdId: ID!
    ancestors: [AncestorRecord]
    coefficientOfRelationship: Float
    updatedAt: Date
  }

  type MeatRun {
    id: ID!
    ownerId: String!
    pairingId: ID!
    hatchEventId: ID
    name: String
    startDate: Date!
    harvestDate: Date
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
    createdAt: Date
    updatedAt: Date
  }

  type Query {
    birds(status: String): [Bird!]!
    bird(id: ID!): Bird
    birdTraits(birdId: ID!): [BirdTrait!]!
    birdNotes(birdId: ID!): [BirdNote!]!
    healthRecords(birdId: ID!): [HealthRecord!]!
    eggProductions(startDate: Date, endDate: Date, birdId: ID, groupId: ID): [EggProduction!]!
    hatchEvents(activeOnly: Boolean): [HatchEvent!]!
    hatchEvent(id: ID!): HatchEvent
    pairings(activeOnly: Boolean): [Pairing!]!
    pairing(id: ID!): Pairing
    flockGroups(activeOnly: Boolean): [FlockGroup!]!
    flockGroup(id: ID!): FlockGroup
    groupMemberships(groupId: ID, activeOnly: Boolean): [GroupMembership!]!
    flockLocations(activeOnly: Boolean): [FlockLocation!]!
    meatRuns(status: String): [MeatRun!]!
    meatRun(id: ID!): MeatRun
    flockEvents(entityType: String, entityId: ID): [FlockEvent!]!
  }

  type Mutation {
    createBird(name: String, tagId: String!, species: String, breed: String, sex: String, status: String, notes: String, hatchDate: Date, origin: String): Bird!
    updateBird(id: ID!, name: String, tagId: String, status: String, notes: String, locationId: ID, sex: String): Bird!
    createFlockGroup(name: String!, purpose: String, type: String, startDate: Date!, endDate: Date, description: String, notes: String): FlockGroup!
    updateFlockGroup(id: ID!, name: String, purpose: String, type: String, startDate: Date, endDate: Date, description: String, notes: String): FlockGroup!
    createFlockLocation(name: String!, type: String!, capacity: Int, description: String, notes: String): FlockLocation!
    updateFlockLocation(id: ID!, name: String, type: String, capacity: Int, isActive: Boolean, description: String, notes: String): FlockLocation!
    recordEggProduction(birdId: ID, groupId: ID, locationId: ID, date: Date!, eggsCount: Int!, daysObserved: Int, avgEggWeightGrams: Float, eggColor: String, eggSize: String, notes: String): EggProduction!
    updateEggProduction(id: ID!, date: Date, eggsCount: Int, daysObserved: Int, locationId: ID, notes: String): EggProduction!
    createPairing(name: String!, roosterIds: [ID], henIds: [ID], pairingDate: Date, active: Boolean, notes: String): Pairing!
    updatePairing(id: ID!, name: String, roosterIds: [ID], henIds: [ID], pairingDate: Date, active: Boolean, notes: String): Pairing!
    recordHatchEvent(setDate: Date!, hatchDate: Date, eggsSet: Int!, notes: String): HatchEvent!
    updateHatchEvent(id: ID!, setDate: Date, hatchDate: Date, eggsSet: Int, eggsFertile: Int, chicksHatched: Int, pullets: Int, cockerels: Int, notes: String): HatchEvent!
    createMeatRun(pairingId: ID!, hatchEventId: ID, name: String, startDate: Date!, startCount: Int!, notes: String): MeatRun!
    updateMeatRun(id: ID!, harvestDate: Date, harvestCount: Int, mortalityCount: Int, avgWeightGrams: Float, status: String, notes: String): MeatRun!
    addHealthRecord(birdId: ID!, eventDate: Date!, type: String!, diagnosis: String, treatment: String, outcome: String, notes: String): HealthRecord!
    deleteFlockEntity(type: String!, id: ID!): Boolean!
  }
`;

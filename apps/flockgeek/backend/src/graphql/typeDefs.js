import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Bird @key(fields: "id") {
    id: ID!
    ownerId: String!
    name: String
    tagId: String!
    species: String
    breed: String
    sex: String
    hatchDate: String
    origin: String
    status: String
    statusDate: String
    statusReason: String
    notes: String
    createdAt: String
    updatedAt: String
  }

  type EggProduction @key(fields: "id") {
    id: ID!
    ownerId: String!
    birdId: ID
    groupId: ID
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

  extend type Query {
    birds: [Bird!]!
    bird(id: ID!): Bird
    eggProductions(startDate: String, endDate: String): [EggProduction!]!
  }

  extend type Mutation {
    createBird(name: String, tagId: String!, species: String, breed: String, sex: String, status: String, notes: String): Bird!
    recordEggProduction(birdId: ID, groupId: ID, date: String!, eggsCount: Int!, avgEggWeightGrams: Float, eggColor: String, eggSize: String, notes: String): EggProduction!
  }
`;

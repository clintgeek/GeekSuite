import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { GraphQLScalarType, Kind } from 'graphql';

// Shared
import { sharedTypeDefs } from './shared/typeDefs.js';

// Per-app schemas
import { typeDefs as noteTypeDefs } from './notegeek/typeDefs.js';
import { resolvers as noteResolvers } from './notegeek/resolvers.js';

import { typeDefs as bujoTypeDefs } from './bujogeek/typeDefs.js';
import { resolvers as bujoResolvers } from './bujogeek/resolvers.js';

import { typeDefs as flockTypeDefs } from './flockgeek/typeDefs.js';
import { resolvers as flockResolvers } from './flockgeek/resolvers.js';

import { typeDefs as fitnessTypeDefs } from './fitnessgeek/typeDefs.js';
import { resolvers as fitnessResolvers } from './fitnessgeek/resolvers.js';

import { typeDefs as bookTypeDefs } from './bookgeek/typeDefs.js';
import { resolvers as bookResolvers } from './bookgeek/resolvers.js';

// Scalar resolver for the shared `Date` type
const dateScalarResolver = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'ISO-8601 Date/DateTime scalar',
    parseValue: (value) => new Date(value),
    serialize: (value) => {
      if (value instanceof Date) return value.toISOString();
      return new Date(value).toISOString();
    },
    parseLiteral: (ast) => {
      if (ast.kind === Kind.INT) return new Date(parseInt(ast.value, 10));
      if (ast.kind === Kind.STRING) return new Date(ast.value);
      return null;
    },
  }),
};

export const typeDefs = mergeTypeDefs([
  sharedTypeDefs,
  noteTypeDefs,
  bujoTypeDefs,
  flockTypeDefs,
  fitnessTypeDefs,
  bookTypeDefs,
]);

export const resolvers = mergeResolvers([
  dateScalarResolver,
  noteResolvers,
  bujoResolvers,
  flockResolvers,
  fitnessResolvers,
  bookResolvers,
]);

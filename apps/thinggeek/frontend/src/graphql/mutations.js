import { gql } from '@apollo/client';
import { PLACE_FIELDS, THING_DETAIL_FIELDS, THING_TYPE_FIELDS } from './queries';

// Every Thing-returning mutation selects the full detail fragment, so the
// answer updates `Thing:<id>` everywhere (card, row, sheet) with no refetch.

export const CREATE_THING = gql`
  mutation CreateThing($input: ThingInput!) {
    createThing(input: $input) {
      ...ThingDetailFields
    }
  }
  ${THING_DETAIL_FIELDS}
`;

export const UPDATE_THING = gql`
  mutation UpdateThing($id: ID!, $input: ThingInput!) {
    updateThing(id: $id, input: $input) {
      ...ThingDetailFields
    }
  }
  ${THING_DETAIL_FIELDS}
`;

export const DELETE_THING = gql`
  mutation DeleteThing($id: ID!) {
    deleteThing(id: $id) {
      success
      message
    }
  }
`;

export const RESTORE_THING = gql`
  mutation RestoreThing($id: ID!) {
    restoreThing(id: $id) {
      ...ThingDetailFields
    }
  }
  ${THING_DETAIL_FIELDS}
`;

export const CREATE_THING_TYPE = gql`
  mutation CreateThingType($input: ThingTypeInput!) {
    createThingType(input: $input) {
      ...ThingTypeFields
    }
  }
  ${THING_TYPE_FIELDS}
`;

export const UPDATE_THING_TYPE = gql`
  mutation UpdateThingType($id: ID!, $input: ThingTypeInput!) {
    updateThingType(id: $id, input: $input) {
      ...ThingTypeFields
    }
  }
  ${THING_TYPE_FIELDS}
`;

export const DELETE_THING_TYPE = gql`
  mutation DeleteThingType($id: ID!) {
    deleteThingType(id: $id) {
      success
      message
    }
  }
`;

export const CREATE_PLACE = gql`
  mutation CreatePlace($input: PlaceInput!) {
    createPlace(input: $input) {
      ...PlaceFields
    }
  }
  ${PLACE_FIELDS}
`;

export const UPDATE_PLACE = gql`
  mutation UpdatePlace($id: ID!, $input: PlaceInput!) {
    updatePlace(id: $id, input: $input) {
      ...PlaceFields
    }
  }
  ${PLACE_FIELDS}
`;

export const DELETE_PLACE = gql`
  mutation DeletePlace($id: ID!) {
    deletePlace(id: $id) {
      success
      message
    }
  }
`;

const PROFILE_FIELDS = `
  savedFilters {
    id
    name
    filter
    sortBy
    sortDir
  }
`;

export const SAVE_THING_FILTER = gql`
  mutation SaveThingFilter($input: ThingSavedFilterInput!) {
    saveThingFilter(input: $input) {
      ${PROFILE_FIELDS}
    }
  }
`;

export const DELETE_THING_FILTER = gql`
  mutation DeleteThingFilter($id: ID!) {
    deleteThingFilter(id: $id) {
      ${PROFILE_FIELDS}
    }
  }
`;

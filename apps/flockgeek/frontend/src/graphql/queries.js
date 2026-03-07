import { gql } from '@apollo/client';

export const GET_BIRDS = gql`
  query GetBirds($status: String) {
    birds(status: $status) {
      id
      tagId
      name
      sex
      breed
      hatchDate
      status
      species
      strain
      cross
      origin
      foundationStock
      locationId
      temperamentScore
      statusDate
      statusReason
      notes
    }
  }
`;

export const GET_LOCATIONS = gql`
  query GetLocations($activeOnly: Boolean) {
    locations(activeOnly: $activeOnly) {
      id
      name
      type
      capacity
      isActive
      notes
    }
  }
`;

export const GET_EGG_PRODUCTIONS = gql`
  query GetEggProductions($startDate: String, $endDate: String, $birdId: ID, $groupId: ID) {
    eggProductions(startDate: $startDate, endDate: $endDate, birdId: $birdId, groupId: $groupId) {
      id
      date
      eggsCount
      locationId
      daysObserved
      eggColor
      eggSize
      source
      quality
      notes
    }
  }
`;

export const GET_PAIRINGS = gql`
  query GetPairings($activeOnly: Boolean) {
    pairings(activeOnly: $activeOnly) {
      id
      name
      roosterIds
      henIds
      pairingDate
      active
      notes
      season
      seasonYear
    }
  }
`;

export const GET_HATCH_EVENTS = gql`
  query GetHatchEvents($activeOnly: Boolean) {
    hatchEvents(activeOnly: $activeOnly) {
      id
      pairingId
      setDate
      hatchDate
      eggsSet
      eggsFertile
      chicksHatched
      pullets
      cockerels
      notes
    }
  }
`;

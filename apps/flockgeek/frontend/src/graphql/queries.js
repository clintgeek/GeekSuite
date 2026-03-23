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
      createdAt
    }
  }
`;

export const GET_LOCATIONS = gql`
  query GetFlockLocations($activeOnly: Boolean) {
    flockLocations(activeOnly: $activeOnly) {
      id
      name
      type
      capacity
      isActive
      description
      notes
    }
  }
`;

export const GET_EGG_PRODUCTIONS = gql`
  query GetEggProductions($startDate: Date, $endDate: Date, $birdId: ID, $groupId: ID) {
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

export const GET_FLOCK_GROUPS = gql`
  query GetFlockGroups($activeOnly: Boolean) {
    flockGroups(activeOnly: $activeOnly) {
      id
      name
      purpose
      type
      startDate
      endDate
      description
      notes
    }
  }
`;

export const GET_GROUP_MEMBERSHIPS = gql`
  query GetGroupMemberships($groupId: ID, $activeOnly: Boolean) {
    groupMemberships(groupId: $groupId, activeOnly: $activeOnly) {
      id
      groupId
      birdId
      joinedAt
      leftAt
      role
      bird {
        id
        name
        tagId
        species
        breed
        sex
      }
    }
  }
`;

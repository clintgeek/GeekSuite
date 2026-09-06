import { gql } from '@apollo/client';

// Both documents declare every field BirdsPage's forms collect, and the
// gateway's createBird/updateBird declare the same list (see the comment on
// `Mutation.createBird` in the gateway's flockgeek typeDefs). Until 2026-09-05
// UPDATE_BIRD declared 7 of them, so ten editable inputs — Breed, Hatch Date,
// Species, Strain, Cross, Origin, Foundation Stock, Temperament, Status Date,
// Status Reason — closed the dialog and changed nothing.
//
// The forms' Sire and Dam inputs are still not here: `models/Bird.js` tracks
// lineage through `pairingId`, has no sire/dam field, and `Bird` exposes
// none — those two inputs have nowhere to go and are reported, not wired.
export const CREATE_BIRD = gql`
  mutation CreateBird($tagId: String!, $name: String, $species: String, $breed: String, $strain: String, $cross: Boolean, $sex: String, $hatchDate: Date, $origin: String, $foundationStock: Boolean, $locationId: ID, $temperamentScore: Int, $status: String, $statusDate: Date, $statusReason: String, $notes: String) {
    createBird(tagId: $tagId, name: $name, species: $species, breed: $breed, strain: $strain, cross: $cross, sex: $sex, hatchDate: $hatchDate, origin: $origin, foundationStock: $foundationStock, locationId: $locationId, temperamentScore: $temperamentScore, status: $status, statusDate: $statusDate, statusReason: $statusReason, notes: $notes) {
      id
      tagId
    }
  }
`;

export const UPDATE_BIRD = gql`
  mutation UpdateBird($id: ID!, $tagId: String, $name: String, $species: String, $breed: String, $strain: String, $cross: Boolean, $sex: String, $hatchDate: Date, $origin: String, $foundationStock: Boolean, $locationId: ID, $temperamentScore: Int, $status: String, $statusDate: Date, $statusReason: String, $notes: String) {
    updateBird(id: $id, tagId: $tagId, name: $name, species: $species, breed: $breed, strain: $strain, cross: $cross, sex: $sex, hatchDate: $hatchDate, origin: $origin, foundationStock: $foundationStock, locationId: $locationId, temperamentScore: $temperamentScore, status: $status, statusDate: $statusDate, statusReason: $statusReason, notes: $notes) {
      id
      tagId
    }
  }
`;

export const DELETE_ENTITY = gql`
  mutation DeleteFlockEntity($type: String!, $id: ID!) {
    deleteFlockEntity(type: $type, id: $id)
  }
`;

export const RECORD_EGG_PRODUCTION = gql`
  mutation RecordEggProduction($date: Date!, $eggsCount: Int!, $daysObserved: Int, $locationId: ID, $notes: String) {
    recordEggProduction(date: $date, eggsCount: $eggsCount, daysObserved: $daysObserved, locationId: $locationId, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_EGG_PRODUCTION = gql`
  mutation UpdateEggProduction($id: ID!, $date: Date, $eggsCount: Int, $daysObserved: Int, $locationId: ID, $notes: String) {
    updateEggProduction(id: $id, date: $date, eggsCount: $eggsCount, daysObserved: $daysObserved, locationId: $locationId, notes: $notes) {
      id
    }
  }
`;

export const CREATE_PAIRING = gql`
  mutation CreatePairing($name: String!, $pairingDate: Date, $notes: String) {
    createPairing(name: $name, pairingDate: $pairingDate, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_PAIRING = gql`
  mutation UpdatePairing($id: ID!, $name: String, $pairingDate: Date, $active: Boolean, $notes: String) {
    updatePairing(id: $id, name: $name, pairingDate: $pairingDate, active: $active, notes: $notes) {
      id
    }
  }
`;

// `hatchDate` is on the gateway's `recordHatchEvent` and was simply never
// declared here, so the Add dialog's Hatch Date field went nowhere.
// Going-over 2026-09-05.
export const RECORD_HATCH_EVENT = gql`
  mutation RecordHatchEvent($setDate: Date!, $hatchDate: Date, $eggsSet: Int!, $notes: String) {
    recordHatchEvent(setDate: $setDate, hatchDate: $hatchDate, eggsSet: $eggsSet, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_HATCH_EVENT = gql`
  mutation UpdateHatchEvent($id: ID!, $setDate: Date, $hatchDate: Date, $eggsSet: Int, $eggsFertile: Int, $chicksHatched: Int, $pullets: Int, $cockerels: Int, $notes: String) {
    updateHatchEvent(id: $id, setDate: $setDate, hatchDate: $hatchDate, eggsSet: $eggsSet, eggsFertile: $eggsFertile, chicksHatched: $chicksHatched, pullets: $pullets, cockerels: $cockerels, notes: $notes) {
      id
    }
  }
`;

export const CREATE_FLOCK_GROUP = gql`
  mutation CreateFlockGroup($name: String!, $purpose: String, $type: String, $startDate: Date!, $endDate: Date, $description: String, $notes: String) {
    createFlockGroup(name: $name, purpose: $purpose, type: $type, startDate: $startDate, endDate: $endDate, description: $description, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_FLOCK_GROUP = gql`
  mutation UpdateFlockGroup($id: ID!, $name: String, $purpose: String, $type: String, $startDate: Date, $endDate: Date, $description: String, $notes: String) {
    updateFlockGroup(id: $id, name: $name, purpose: $purpose, type: $type, startDate: $startDate, endDate: $endDate, description: $description, notes: $notes) {
      id
    }
  }
`;

export const CREATE_FLOCK_LOCATION = gql`
  mutation CreateFlockLocation($name: String!, $type: String!, $capacity: Int, $description: String, $notes: String) {
    createFlockLocation(name: $name, type: $type, capacity: $capacity, description: $description, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_FLOCK_LOCATION = gql`
  mutation UpdateFlockLocation($id: ID!, $name: String, $type: String, $capacity: Int, $isActive: Boolean, $description: String, $notes: String) {
    updateFlockLocation(id: $id, name: $name, type: $type, capacity: $capacity, isActive: $isActive, description: $description, notes: $notes) {
      id
    }
  }
`;

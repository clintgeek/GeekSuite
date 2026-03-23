import { gql } from '@apollo/client';

export const CREATE_BIRD = gql`
  mutation CreateBird($tagId: String!, $name: String, $sex: String, $breed: String, $status: String, $notes: String, $hatchDate: Date, $origin: String) {
    createBird(tagId: $tagId, name: $name, sex: $sex, breed: $breed, status: $status, notes: $notes, hatchDate: $hatchDate, origin: $origin) {
      id
      tagId
    }
  }
`;

export const UPDATE_BIRD = gql`
  mutation UpdateBird($id: ID!, $tagId: String, $name: String, $sex: String, $status: String, $notes: String, $locationId: ID) {
    updateBird(id: $id, tagId: $tagId, name: $name, sex: $sex, status: $status, notes: $notes, locationId: $locationId) {
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
  mutation RecordEggProduction($date: Date!, $eggsCount: Int!, $locationId: ID, $notes: String) {
    recordEggProduction(date: $date, eggsCount: $eggsCount, locationId: $locationId, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_EGG_PRODUCTION = gql`
  mutation UpdateEggProduction($id: ID!, $date: Date, $eggsCount: Int, $locationId: ID, $notes: String) {
    updateEggProduction(id: $id, date: $date, eggsCount: $eggsCount, locationId: $locationId, notes: $notes) {
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

export const RECORD_HATCH_EVENT = gql`
  mutation RecordHatchEvent($setDate: Date!, $eggsSet: Int!, $notes: String) {
    recordHatchEvent(setDate: $setDate, eggsSet: $eggsSet, notes: $notes) {
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

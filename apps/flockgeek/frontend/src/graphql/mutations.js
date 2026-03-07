import { gql } from '@apollo/client';

export const CREATE_BIRD = gql`
  mutation CreateBird($tagId: String!, $name: String, $sex: String, $breed: String, $status: String, $notes: String, $hatchDate: String, $origin: String) {
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
  mutation DeleteEntity($type: String!, $id: ID!) {
    deleteEntity(type: $type, id: $id)
  }
`;

export const RECORD_EGG_PRODUCTION = gql`
  mutation RecordEggProduction($date: String!, $eggsCount: Int!, $locationId: ID, $notes: String) {
    recordEggProduction(date: $date, eggsCount: $eggsCount, locationId: $locationId, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_EGG_PRODUCTION = gql`
  mutation UpdateEggProduction($id: ID!, $date: String, $eggsCount: Int, $locationId: ID, $notes: String) {
    updateEggProduction(id: $id, date: $date, eggsCount: $eggsCount, locationId: $locationId, notes: $notes) {
      id
    }
  }
`;

export const CREATE_PAIRING = gql`
  mutation CreatePairing($name: String!, $pairingDate: String, $notes: String) {
    createPairing(name: $name, pairingDate: $pairingDate, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_PAIRING = gql`
  mutation UpdatePairing($id: ID!, $name: String, $pairingDate: String, $active: Boolean, $notes: String) {
    updatePairing(id: $id, name: $name, pairingDate: $pairingDate, active: $active, notes: $notes) {
      id
    }
  }
`;

export const RECORD_HATCH_EVENT = gql`
  mutation RecordHatchEvent($setDate: String!, $eggsSet: Int!, $notes: String) {
    recordHatchEvent(setDate: $setDate, eggsSet: $eggsSet, notes: $notes) {
      id
    }
  }
`;

export const UPDATE_HATCH_EVENT = gql`
  mutation UpdateHatchEvent($id: ID!, $setDate: String, $hatchDate: String, $eggsSet: Int, $eggsFertile: Int, $chicksHatched: Int, $pullets: Int, $cockerels: Int, $notes: String) {
    updateHatchEvent(id: $id, setDate: $setDate, hatchDate: $hatchDate, eggsSet: $eggsSet, eggsFertile: $eggsFertile, chicksHatched: $chicksHatched, pullets: $pullets, cockerels: $cockerels, notes: $notes) {
      id
    }
  }
`;

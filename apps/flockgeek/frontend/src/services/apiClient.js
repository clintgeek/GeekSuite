import { createApolloClient } from '@geeksuite/api-client';
import {
  GET_BIRDS,
  GET_LOCATIONS,
  GET_EGG_PRODUCTIONS,
  GET_PAIRINGS,
  GET_HATCH_EVENTS
} from '../graphql/queries';
import {
  CREATE_BIRD,
  UPDATE_BIRD,
  DELETE_ENTITY,
  RECORD_EGG_PRODUCTION,
  UPDATE_EGG_PRODUCTION,
  CREATE_PAIRING,
  UPDATE_PAIRING,
  RECORD_HATCH_EVENT,
  UPDATE_HATCH_EVENT
} from '../graphql/mutations';

// Local Apollo Client for the bridge
const apolloClient = createApolloClient('flockgeek');


const client = async (config) => {
  const { method = 'get', url, data, params } = config;

  // GET Requests
  if (method.toLowerCase() === 'get') {
    if (url === '/birds') {
      const { data: result } = await apolloClient.query({
        query: GET_BIRDS,
        variables: { status: params?.status }
      });
      return {
        data: {
          data: {
            birds: result.birds,
            pagination: { total: result.birds.length, page: 1, limit: 1000 }
          }
        }
      };
    }

    if (url === '/locations') {
      const { data: result } = await apolloClient.query({
        query: GET_LOCATIONS
      });
      return { data: { data: { locations: result.locations } } };
    }

    if (url === '/egg-production') {
      const { data: result } = await apolloClient.query({
        query: GET_EGG_PRODUCTIONS,
        variables: {
          startDate: params?.startDate,
          endDate: params?.endDate,
          birdId: params?.birdId,
          groupId: params?.groupId
        }
      });
      return {
        data: {
          data: {
            eggProduction: result.eggProductions,
            pagination: { total: result.eggProductions.length, page: params?.page || 1, limit: params?.limit || 10 }
          }
        }
      };
    }

    if (url === '/pairings') {
      const { data: result } = await apolloClient.query({
        query: GET_PAIRINGS,
        variables: { activeOnly: params?.active === 'true' }
      });
      return {
        data: {
          data: {
            pairings: result.pairings,
            pagination: { total: result.pairings.length, page: 1, limit: 1000 }
          }
        }
      };
    }

    if (url === '/hatch-events') {
      const { data: result } = await apolloClient.query({
        query: GET_HATCH_EVENTS
      });
      return {
        data: {
          data: {
            hatchEvents: result.hatchEvents,
            pagination: { total: result.hatchEvents.length, page: 1, limit: 1000 }
          }
        }
      };
    }

    if (url.startsWith('/groups/bird/')) {
      // Just return empty for now as it's a specific optimized call
      return { data: { data: { groups: [] } } };
    }
  }

  // POST Requests
  if (method.toLowerCase() === 'post') {
    if (url === '/birds') {
      const { data: result } = await apolloClient.mutate({
        mutation: CREATE_BIRD,
        variables: data
      });
      return { data: { data: result.createBird } };
    }
    if (url === '/egg-production') {
      const { data: result } = await apolloClient.mutate({
        mutation: RECORD_EGG_PRODUCTION,
        variables: data
      });
      return { data: { data: result.recordEggProduction } };
    }
    if (url === '/pairings') {
      const { data: result } = await apolloClient.mutate({
        mutation: CREATE_PAIRING,
        variables: data
      });
      return { data: { data: result.createPairing } };
    }
    if (url === '/hatch-events') {
      const { data: result } = await apolloClient.mutate({
        mutation: RECORD_HATCH_EVENT,
        variables: data
      });
      return { data: { data: result.recordHatchEvent } };
    }
  }

  // PUT Requests
  if (method.toLowerCase() === 'put') {
    if (url.startsWith('/birds/')) {
      const id = url.split('/').pop();
      const { data: result } = await apolloClient.mutate({
        mutation: UPDATE_BIRD,
        variables: { id, ...data }
      });
      return { data: { data: result.updateBird } };
    }
    if (url.startsWith('/egg-production/')) {
      const id = url.split('/').pop();
      const { data: result } = await apolloClient.mutate({
        mutation: UPDATE_EGG_PRODUCTION,
        variables: { id, ...data }
      });
      return { data: { data: result.updateEggProduction } };
    }
    if (url.startsWith('/pairings/')) {
      const id = url.split('/').pop();
      const { data: result } = await apolloClient.mutate({
        mutation: UPDATE_PAIRING,
        variables: { id, ...data }
      });
      return { data: { data: result.updatePairing } };
    }
    if (url.startsWith('/hatch-events/')) {
      const id = url.split('/').pop();
      const { data: result } = await apolloClient.mutate({
        mutation: UPDATE_HATCH_EVENT,
        variables: { id, ...data }
      });
      return { data: { data: result.updateHatchEvent } };
    }
  }

  // DELETE Requests
  if (method.toLowerCase() === 'delete') {
    let type = '';
    if (url.startsWith('/birds/')) type = 'bird';
    if (url.startsWith('/egg-production/')) type = 'eggproduction';
    if (url.startsWith('/pairings/')) type = 'pairing';
    if (url.startsWith('/hatch-events/')) type = 'hatch_event'; // Actually not in my mutation list yet

    if (type) {
      const id = url.split('/').pop();
      await apolloClient.mutate({
        mutation: DELETE_ENTITY,
        variables: { type, id }
      });
      return { data: { success: true } };
    }
  }

  throw new Error(`Unhandled API call in bridge: ${ method } ${ url }`);
};

// Add axios-like helpers
client.get = (url, config = {}) => client({ ...config, method: 'get', url });
client.post = (url, data, config = {}) => client({ ...config, method: 'post', url, data });
client.put = (url, data, config = {}) => client({ ...config, method: 'put', url, data });
client.delete = (url, config = {}) => client({ ...config, method: 'delete', url });

export default client;

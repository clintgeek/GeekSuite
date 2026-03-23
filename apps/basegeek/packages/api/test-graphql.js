import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client/core/index.js';
import fetch from 'node-fetch'; // need to npm install node-fetch locally or run via script

const token = process.env.TOKEN || 'test';

const httpLink = createHttpLink({
  uri: 'http://localhost:4000/graphql',
  fetch,
  headers: {
    authorization: token ? `Bearer ${ token }` : "",
  }
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache()
});

async function run() {
  try {
    const { data: meData } = await client.query({
      query: gql`
        query {
          me {
            id
            email
          }
        }
      `
    });
    console.log('Me:', meData);

    const { data: bujoData } = await client.query({
      query: gql`
        query {
          dailyTasks(date: "2025-04-24") {
            id
            content
            status
          }
        }
      `
    });
    console.log('Bujo Tasks:', bujoData.dailyTasks.length);

  } catch (err) {
    console.error('GraphQL Error:', err.message);
    if (err.networkError) {
      console.error('Network Error:', err.networkError.result || err.networkError);
    }
  }
}

run();

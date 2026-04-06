import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client/core/index.js';
import fetch from 'node-fetch'; // need to npm install node-fetch locally or run via script

const token = process.env.TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODE4YzJiZGRjZjYyNjkwOWY2YTkzYTEiLCJlbWFpbCI6ImNsaW50QGNsaW50Z2Vlay5jb20iLCJpYXQiOjE3NzI5ODg5NjEsImV4cCI6MTc3Mjk5MjU2MX0.KFTZcv_PPtF1McKnqsxb-yPL4ihTffQSkbJtI4neih4';

const httpLink = createHttpLink({
  uri: 'https://basegeek.clintgeek.com/graphql',
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
    console.log('Bujo Tasks:', bujoData.dailyTasks.map(t => t.id));

    if (bujoData.dailyTasks.length > 0) {
      const taskId = bujoData.dailyTasks[0].id;
      console.log('Attempting to update status for task:', taskId);
      const { data: updateData } = await client.mutate({
        mutation: gql`
          mutation UpdateTaskStatus($id: ID!, $status: String!) {
            updateTaskStatus(id: $id, status: $status) {
              id
              status
            }
          }
        `,
        variables: {
          id: taskId,
          status: 'completed'
        }
      });
      console.log('Update result:', updateData);
    }
  } catch (err) {
    console.error('GraphQL Error:', err.message);
    if (err.networkError) {
      console.error('Network Error:', err.networkError.result || err.networkError);
    }
    if (err.graphQLErrors) {
      console.error('GraphQLErrors:', JSON.stringify(err.graphQLErrors, null, 2));
    }
  }
}

run();

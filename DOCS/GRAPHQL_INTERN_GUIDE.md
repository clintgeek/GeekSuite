# Intern Project Guide: GeekSuite GraphQL API Migration

## 🎯 Project Overview
Welcome to the team! Currently, GeekSuite (our microservices monorepo) uses independent Express REST APIs for each application (NoteGeek, FitnessGeek, FlockGeek, etc.). 

Our goal is to migrate to a **Unified GraphQL API** using **Apollo Federation**. This will allow our frontend applications to request data across multiple domains in a single query.

Your project is to set up the foundation for this new architecture and migrate the first application, **NoteGeek**, to use GraphQL alongside its existing REST API.

---

## 📚 Prerequisites
Before writing code, please briefly familiarize yourself with the following:
- **Node.js and Express**: The core backend stack.
- **Apollo GraphQL & Federation**: We highly recommend completing the [Apollo GraphOS Basics](https://www.apollographql.com/tutorials/) tutorial.
- **Monorepos**: We use `pnpm` workspaces. Take a look at `pnpm-workspace.yaml` and understand how packages in `packages/` are shared with `apps/`.

---

## 🚀 Phase 1: Shared Setup & Schemas (The DRY Approach)
**Goal:** Prevent repetition across our applications by extracting boilerplate into shared utilities.

1. **Shared Config & Schemas**: Create `packages/graphql-config` for base schemas. Set up [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) here.
2. **Shared Frontend Component**: In our existing `packages/ui` (or a newly created `packages/api-client`), create a `<GeekSuiteApolloProvider>` component. This component should instantiate the `ApolloClient` (handling the API Gateway URL and automatically attaching the JWT auth token) and wrap its `children` in standard `<ApolloProvider>`. No app should configure its own client!
3. **Shared Backend Utility**: Create a utility package (e.g., `packages/apollo-server-utils`) exporting a `setupGeekSuiteSubgraph(app, schema, resolvers)`. This function will install the Apollo Express middleware, handle the boilerplate GraphQL context creation (extracting JWT user info), and expose the `/graphql` route. 

---

## 🌉 Phase 2: Create the API Gateway
**Goal:** Set up the Apollo Gateway. This is the single access point for all frontends. It will route queries to the correct microservice (subgraph).

1. **Initialize the App**: Create a new directory `apps/api-gateway` and initialize a Node.js project.
2. **Install Apollo**: Install `@apollo/server` and `@apollo/gateway`.
3. **Authentication Context**: 
   - Integrate with our existing auth mechanisms. 
   - Configure the gateway to extract the JWT token from the `Authorization` header on incoming requests.
   - Use functions from `@geeksuite/user` or `@geeksuite/auth` (if applicable) to verify the token and attach the user identity to the GraphQL `context`.
4. **Connect a Subgraph**: Configure the `ApolloGateway` class with a `supergraphSdl` or a custom `ServiceList` pointing to your local NoteGeek backend (which you will build in Phase 3).

---

## 📝 Phase 3: Migrate NoteGeek Backend (The Subgraph)
**Goal:** Add a GraphQL endpoint to the existing NoteGeek Express application. We won't delete the REST API yet, we will just run GraphQL alongside it.

1. **Setup**: Navigate to `apps/notegeek/backend`. Install your shared backend utility.
2. **Define the Schema**: Create your Type Definitions (Schema) representing a Note. For example:
   ```graphql
   type Note @key(fields: "id") {
     id: ID!
     title: String!
     content: String!
     tags: [String]!
     createdAt: String!
     updatedAt: String!
   }
   ```
3. **Write Resolvers**: Create resolver functions that fetch Note data. **Tip:** Simply wrap the existing Mongoose model calls (e.g., `Note.find()`, `Note.findById()`). You shouldn't need to change any database structures!
4. **Expose the Endpoint**: Import your `setupGeekSuiteSubgraph` utility from Phase 1 and pass it the Express `app`, schema, and resolvers. This perfectly adheres to the KISS principle!

---

## 🎨 Phase 4: Migrate NoteGeek Frontend
**Goal:** Update the frontend React application to consume the new GraphQL API instead of standard `axios` REST calls.

1. **Provider Setup**: Navigate to `apps/notegeek/frontend`. Import the `<GeekSuiteApolloProvider>` shared component from Phase 1 and wrap the React application with it. No need to manually configure Apollo Client!
2. **Iterative Refactor**: 
   - Start small! Pick a single straightforward component (like the Notes list or sidebar).
   - Replace the `axios.get` call with a GraphQL `useQuery` hook.
   - Ensure the feature still works perfectly in the UI.
   - Continue refactoring the remaining fetch and mutation (`useMutation`) calls iteratively.

---

## ✅ Review & Verification Checklist
Once you think you are done, verify the following:
- [ ] Are both the `api-gateway` and `notegeek/backend` servers running simultaneously without port conflicts?
- [ ] Can you open **Apollo Sandbox** (the GraphQL playground) against your `api-gateway` URL and successfully execute a query to fetch a Note?
- [ ] Does the NoteGeek web interface function exactly as it did before, but with network requests hitting the GraphQL API Gateway?

Feel free to ask the team if you run into any architectural questions or Node.js hurdles along the way. Good luck!

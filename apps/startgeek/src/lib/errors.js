// errors.js — the one error type startgeek's fetch clients raise on purpose.
//
// It lives on its own, apart from `graphql.js`, for one reason: `graphql.js`
// reads `import.meta.env`, which only exists under Vite, so plain
// `node --test` cannot import it. Any pure module that needs to *recognize*
// this error (see `commandFailure.js`) imports it from here instead, and
// `graphql.js` re-exports it so every existing `import { UnauthorizedError }
// from './graphql'` keeps working against the same class identity —
// `instanceof` would break if there were two copies.

/** The session is over: basegeek answered 401, or the GraphQL error said so. */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

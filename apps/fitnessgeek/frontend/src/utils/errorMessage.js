/**
 * The message a person should see for a failed request.
 *
 * Calls through `apiService` reject with an ApolloError, whose server text
 * lives in `graphQLErrors[0].message` ("Household not found", "You are
 * already part of a household"). Components were written for Axios and read
 * `err.response.data.error.message` — never present on an ApolloError — so
 * every one of those messages was swapped for a generic "Failed to …".
 * REST calls (`restClient`) still reject Axios-shaped; both are read here.
 *
 * Anything else (a TypeError, a network drop) gets the caller's fallback:
 * its raw text is not written for a person.
 */
export function errorMessage(err, fallback) {
  return (
    err?.graphQLErrors?.[0]?.message ||
    err?.response?.data?.error?.message ||
    fallback
  );
}

export default errorMessage;

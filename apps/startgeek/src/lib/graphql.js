const URL =
  import.meta.env.VITE_GRAPHQL_API_URL || 'https://basegeek.clintgeek.com/graphql'

export class UnauthorizedError extends Error {}

export async function gql(query, variables) {
  const res = await fetch(URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 401) throw new UnauthorizedError()

  const json = await res.json()

  if (json.errors?.length) {
    const unauth = json.errors.some(
      (e) =>
        e.extensions?.code === 'UNAUTHENTICATED' ||
        /unauthori[sz]ed/i.test(e.message)
    )
    if (unauth) throw new UnauthorizedError()
    throw new Error(json.errors[0].message)
  }

  return json.data
}

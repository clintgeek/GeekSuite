export const BASEGEEK =
  import.meta.env.VITE_BASEGEEK_URL || 'https://basegeek.clintgeek.com'

export const loginUrl = () =>
  `${BASEGEEK}/login?app=startgeek&redirect=${encodeURIComponent(
    window.location.href
  )}`

export const logout = () =>
  fetch(`${BASEGEEK}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })

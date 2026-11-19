import { useSession } from '../hooks/useSession'
import { loginUrl } from '../lib/basegeek'

const SessionButton = () => {
  const { user, status, signOut, checking, recheck } = useSession()

  if (status === 'loading') {
    return <span className="on-photo text-sm text-ink-2">…</span>
  }

  // Basegeek didn't answer: not signed out, so no "Sign in" — offer a retry.
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={recheck}
        disabled={checking}
        className="on-photo hit44 text-[13px] font-medium text-ink-2 hover:text-ink transition-colors rounded disabled:opacity-60"
        aria-label="Couldn't reach your account. Retry"
      >
        {checking ? 'Connecting…' : 'Not connected · Retry'}
      </button>
    )
  }

  if (status === 'in' && user) {
    return (
      <span className="on-photo flex items-center gap-3 text-[13px]">
        <span className="text-ink">{user.username}</span>
        <button
          onClick={signOut}
          className="signout-btn text-xs text-ink-2 hover:text-ink transition-colors rounded"
        >
          Sign out
        </button>
      </span>
    )
  }

  return (
    <a
      href={loginUrl()}
      className="on-photo text-[13px] font-medium text-ink-2 hover:text-ink transition-colors rounded no-underline"
    >
      Sign in
    </a>
  )
}

export default SessionButton

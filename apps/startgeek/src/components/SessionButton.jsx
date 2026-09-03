import { useSession } from '../hooks/useSession'
import { loginUrl } from '../lib/basegeek'

const SessionButton = () => {
  const { user, status, signOut } = useSession()

  if (status === 'loading') {
    return (
      <span className="text-sm text-white/30">…</span>
    )
  }

  if (status === 'in' && user) {
    return (
      <button
        onClick={signOut}
        className="group text-sm text-white/70 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
      >
        {user.username}
        <span className="ml-2 text-white/40 group-hover:text-white/70 text-xs">
          · Sign out
        </span>
      </button>
    )
  }

  return (
    <a
      href={loginUrl()}
      className="text-sm font-medium text-white/80 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
    >
      Sign in
    </a>
  )
}

export default SessionButton

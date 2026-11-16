import { useState } from 'react'

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * The console's "couldn't load" panel — the suite's GeekLoadError rule
 * (packages/ui/src/feedback/GeekLoadError.jsx) in this app's own dark-glass
 * look: a failure says so, offers Retry with a real 44px target, and is
 * announced (role="alert"). It must never look like an empty day.
 * GeekLoadError itself is MUI, which this app does not carry.
 */
export const LoadProblem = ({ title, detail, onRetry, retrying = false }) => {
  const [pending, setPending] = useState(false)
  const busy = retrying || pending
  const handleRetry = () => {
    if (busy || !onRetry) return
    const result = onRetry()
    if (result && typeof result.then === 'function') {
      setPending(true)
      const done = () => setPending(false)
      result.then(done, done)
    }
  }
  const line = isOffline() ? "You're offline. It will load when you're back online." : detail

  return (
    <div className="row" data-load-problem="">
      <section className="mod !min-h-0" role="alert" aria-label={title}>
        <div className="mod-body !flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[15px] text-ink">{title}</span>
            {line && <span className="text-[13px] text-ink-2">{line}</span>}
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={busy}
              aria-busy={busy || undefined}
              className="min-h-[44px] min-w-[44px] px-4 rounded-full border border-hair-strong font-mono text-[12px] tracking-wide text-ink hover:bg-panel-hover transition-colors disabled:opacity-60"
            >
              {busy ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/** A refresh failed over rows that are still on screen: say they are old. */
export const StaleNotice = ({ loadedAt, onRetry, retrying = false }) => {
  const when = loadedAt
    ? new Date(loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  return (
    <div
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair-strong px-4 py-1"
      style={{ background: 'rgba(12, 15, 21, 0.78)' }}
      role="status"
      data-stale-notice=""
    >
      <span className="text-[13px] text-ink-2">
        {isOffline() ? "You're offline" : "Couldn't refresh"}
        {when ? ` — showing ${when}` : ''}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="min-h-[44px] px-3 font-mono text-[12px] tracking-wide text-ink hover:text-accent transition-colors disabled:opacity-60"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}

export default LoadProblem

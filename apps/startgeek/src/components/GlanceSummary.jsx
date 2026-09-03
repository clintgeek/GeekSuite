import { useMemo } from 'react'
import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// One sentence under the day track: what's ahead, then what's already done.
const GlanceSummary = () => {
  const { data } = useGlance()
  const { status } = useSession()

  const parts = useMemo(() => {
    if (!data) return null
    const due = data.tasks?.due?.length || 0
    const overdue = data.tasks?.overdue?.length || 0
    const events = data.tasks?.events?.length || 0
    const habitsLeft = data.habits?.filter((h) => !h.doneToday).length || 0
    const done = data.tasks?.completedCount || 0
    const blocked = data.tasks?.blockedCount || 0

    const ahead = []
    if (due > 0) ahead.push(plural(due, 'task'))
    if (events > 0) ahead.push(plural(events, 'event'))
    if (habitsLeft > 0) ahead.push(`${plural(habitsLeft, 'habit')} left`)

    const behind = []
    if (done > 0) behind.push(`${done} done`)
    if (blocked > 0) behind.push(`${blocked} blocked`)

    if (!ahead.length && !overdue && !behind.length) return null
    return { ahead, overdue, behind }
  }, [data])

  if (status !== 'in' || !parts) return null

  const { ahead, overdue, behind } = parts
  const lead = ahead.length ? `${ahead.join(', ')} today` : overdue ? 'Nothing new today' : 'Clear day'

  return (
    <p className="text-[15px] leading-relaxed text-ink" style={{ textWrap: 'balance' }}>
      {lead}
      {overdue > 0 && (
        <>
          {', '}
          <span className="text-critical">{overdue} overdue</span>
        </>
      )}
      .
      {behind.length > 0 && <span className="text-ink-3"> {behind.join(', ')}.</span>}
    </p>
  )
}

export default GlanceSummary

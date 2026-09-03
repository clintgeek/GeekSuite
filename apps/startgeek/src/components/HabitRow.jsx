import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { TOGGLE_HABIT_LOG } from '../lib/queries'

// A habit as a pill: its own colour as the switch, name, streak in mono.
const HabitRow = ({ habit, date }) => {
  const { refetch } = useGlance()
  const { markOut } = useSession()

  const handleToggle = async () => {
    try {
      await gql(TOGGLE_HABIT_LOG, { habitId: habit.id, date })
      refetch()
    } catch (err) {
      if (err instanceof UnauthorizedError) markOut()
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`habit ${habit.doneToday ? 'on' : ''}`}
      style={{ '--c': habit.color || 'var(--ink-2)' }}
      aria-pressed={habit.doneToday}
      aria-label={`${habit.doneToday ? 'Undo' : 'Log'} ${habit.name}`}
    >
      <i className="habit-sw" aria-hidden="true" />
      <span className={`flex-1 min-w-0 truncate text-[13px] ${habit.doneToday ? 'text-ink-2' : 'text-ink'}`}>
        {habit.name}
      </span>
      {habit.currentStreak > 0 && (
        <span className="font-mono text-[11px] text-ink-3 tnum">×{habit.currentStreak}</span>
      )}
    </button>
  )
}

export default HabitRow

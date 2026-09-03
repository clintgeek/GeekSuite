import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { TOGGLE_HABIT_LOG } from '../lib/queries'

const HabitRow = ({ habit, date }) => {
  const { refetch } = useGlance()
  const { markOut } = useSession()

  const handleToggle = async () => {
    try {
      await gql(TOGGLE_HABIT_LOG, { habitId: habit.id, date })
      refetch()
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        markOut()
      }
    }
  }

  return (
    <div className="group flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 -ml-1 p-1.5 rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-colors"
        aria-label={`Toggle ${habit.name}`}
      >
        <span
          style={{ color: habit.color || 'rgba(255, 255, 255, 0.35)' }}
          className={`block w-2 h-2 rounded-full border transition-colors ${
            habit.doneToday
              ? 'bg-current border-current'
              : 'bg-transparent border-current'
          }`}
        />
      </button>
      <span className="text-sm text-white/85">{habit.name}</span>
    </div>
  )
}

export default HabitRow

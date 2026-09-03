import Module from './Module'

const fmt = (n) => Math.round(n).toLocaleString()

const fmtDuration = (seconds) => {
  if (seconds == null || Number.isNaN(seconds)) return null
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

const fmtActivity = (activity) => {
  if (!activity) return null
  const parts = [activity.activityName || activity.activityType || 'Activity']
  const duration = fmtDuration(activity.duration)
  if (activity.calories != null) parts.push(`${fmt(activity.calories)} kcal`)
  else if (duration) parts.push(duration)
  return parts.join(' · ')
}

// Calories as the figure, streak across from the goal line, meals and last
// activity beneath. Keeps the pane compact while surfacing more data.
const FitnessModule = ({ fitness }) => {
  const hasCalories = fitness.calories != null || fitness.calorieGoal != null
  const calories = fitness.calories != null ? fitness.calories : null
  const goal = fitness.calorieGoal != null ? fitness.calorieGoal : null
  const ratio = calories != null && goal > 0 ? Math.min(100, (calories / goal) * 100) : null

  const meals = fitness.mealsLogged > 0 ? `${fitness.mealsLogged} meal${fitness.mealsLogged === 1 ? '' : 's'} logged` : null
  const streak = fitness.loginStreak > 0 ? `${fitness.loginStreak}-day streak` : null
  const lastActivity = fmtActivity(fitness.lastActivity)

  return (
    <Module label="Fitness" link={{ label: 'FitnessGeek', href: 'https://fitnessgeek.clintgeek.com' }}>
      {hasCalories && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[26px] font-light leading-none tracking-[-0.02em] tnum">
              {calories != null ? fmt(calories) : '--'}
              <small className="ml-1 text-xs font-normal tracking-normal text-ink-3">
                / {goal != null ? fmt(goal) : '--'} kcal
              </small>
            </div>
            {streak && (
              <b className="shrink-0 font-mono text-[11px] tracking-wide text-ink">
                {streak}
              </b>
            )}
          </div>
          <div className="meter" aria-hidden="true">
            <i style={{ width: ratio != null ? `${ratio}%` : '0%' }} />
          </div>
        </>
      )}
      {(meals || lastActivity) && (
        <div className="flex justify-between gap-3 font-mono text-[11px] text-ink-3 tracking-wide tnum">
          <span className="truncate">{meals}</span>
          {lastActivity && <span className="truncate text-right">{lastActivity}</span>}
        </div>
      )}
    </Module>
  )
}

export default FitnessModule

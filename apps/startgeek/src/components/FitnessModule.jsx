import Module from './Module'
import { useLinkTarget } from '../hooks/useLinkTarget'
import { fitnessSummary } from '../lib/fitnessSummary'

const FITNESSGEEK = 'https://fitnessgeek.clintgeek.com'

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
  const targetProps = useLinkTarget()
  const { logged, calories, goal, ratio } = fitnessSummary(fitness)

  const meals = fitness.mealsLogged > 0 ? `${fitness.mealsLogged} meal${fitness.mealsLogged === 1 ? '' : 's'} logged` : null
  const streak = fitness.loginStreak > 0 ? `${fitness.loginStreak}-day streak` : null
  const lastActivity = fmtActivity(fitness.lastActivity)

  return (
    <Module label="Fitness" link={{ label: 'FitnessGeek', href: FITNESSGEEK }}>
      {logged ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[26px] font-light leading-none tracking-[-0.02em] tnum">
              {fmt(calories)}
              {goal != null && (
                <small className="ml-1 text-xs font-normal tracking-normal text-ink-2">
                  / {fmt(goal)} kcal
                </small>
              )}
            </div>
            {streak && (
              <b className="shrink-0 font-mono text-[12px] tracking-wide text-ink">
                {streak}
              </b>
            )}
          </div>
          {goal != null && (
            <div className="meter" aria-hidden="true">
              <i style={{ width: `${ratio}%` }} />
            </div>
          )}
        </>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] text-ink-2">
            Nothing logged yet today
            {goal != null && <span className="block mt-1 font-mono text-[12px] text-ink-3 tnum">Goal {fmt(goal)} kcal</span>}
          </p>
          {streak && (
            <b className="shrink-0 font-mono text-[12px] tracking-wide text-ink">
              {streak}
            </b>
          )}
        </div>
      )}
      {(meals || lastActivity) && (
        <div className="flex justify-between gap-3 font-mono text-[12px] text-ink-3 tracking-wide tnum">
          <span className="truncate">{meals}</span>
          {lastActivity && <span className="truncate text-right">{lastActivity}</span>}
        </div>
      )}
      {!logged && (
        <a
          href={FITNESSGEEK}
          {...targetProps}
          className="mt-auto self-start inline-flex items-center min-h-[44px] font-mono text-[12px] tracking-wide text-accent no-underline hover:underline"
        >
          Log a meal
        </a>
      )}
    </Module>
  )
}

export default FitnessModule

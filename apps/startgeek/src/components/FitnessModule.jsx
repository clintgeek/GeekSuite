import Module from './Module'

const fmt = (n) => Math.round(n).toLocaleString()

// Calories as the figure, a meter against goal, meals and streak beneath.
const FitnessModule = ({ fitness }) => {
  const hasCalories = fitness.calories != null || fitness.calorieGoal != null
  const calories = fitness.calories != null ? fitness.calories : null
  const goal = fitness.calorieGoal != null ? fitness.calorieGoal : null
  const ratio = calories != null && goal > 0 ? Math.min(100, (calories / goal) * 100) : null

  const meals = fitness.mealsLogged > 0 ? `${fitness.mealsLogged} meal${fitness.mealsLogged === 1 ? '' : 's'} logged` : null
  const streak = fitness.loginStreak > 0 ? `${fitness.loginStreak}-day streak` : null

  return (
    <Module label="Fitness" link={{ label: 'FitnessGeek', href: 'https://fitnessgeek.clintgeek.com' }}>
      {hasCalories && (
        <>
          <div className="text-[26px] font-light leading-none tracking-[-0.02em] tnum">
            {calories != null ? fmt(calories) : '--'}
            <small className="ml-1 text-xs font-normal tracking-normal text-ink-3">
              / {goal != null ? fmt(goal) : '--'} kcal
            </small>
          </div>
          <div className="meter" aria-hidden="true">
            <i style={{ width: ratio != null ? `${ratio}%` : '0%' }} />
          </div>
        </>
      )}
      {(meals || streak) && (
        <div className="flex justify-between gap-3 font-mono text-[11px] text-ink-3 tracking-wide tnum">
          <span>{meals}</span>
          {streak && <b className="font-medium text-ink">{streak}</b>}
        </div>
      )}
    </Module>
  )
}

export default FitnessModule

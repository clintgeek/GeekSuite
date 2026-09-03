const FitnessLine = ({ fitness }) => {
  const parts = []

  if (fitness.calories != null || fitness.calorieGoal != null) {
    const c =
      fitness.calories != null
        ? Math.round(fitness.calories).toLocaleString()
        : '--'
    const g =
      fitness.calorieGoal != null
        ? Math.round(fitness.calorieGoal).toLocaleString()
        : '--'
    parts.push(`${c} / ${g} kcal`)
  }

  if (fitness.mealsLogged > 0) {
    parts.push(
      `${fitness.mealsLogged} meal${fitness.mealsLogged === 1 ? '' : 's'}`
    )
  }

  if (fitness.loginStreak != null && fitness.loginStreak > 0) {
    parts.push(`${fitness.loginStreak}-day streak`)
  }

  if (parts.length === 0) return null

  return <span className="text-sm text-white/85">{parts.join(' · ')}</span>
}

export default FitnessLine

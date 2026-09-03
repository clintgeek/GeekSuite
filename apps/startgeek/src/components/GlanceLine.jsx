import { useMemo } from 'react'

const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const GlanceLine = ({ data }) => {
  const text = useMemo(() => {
    const primary = []
    const due = data.tasks?.due?.length || 0
    const overdue = data.tasks?.overdue?.length || 0
    const habitsLeft = data.habits?.filter((h) => !h.doneToday).length || 0

    if (due > 0) primary.push(`${pluralize(due, 'task')} today`)
    if (overdue > 0) primary.push(`${overdue} overdue`)
    if (habitsLeft > 0) primary.push(`${pluralize(habitsLeft, 'habit')} left`)

    if (primary.length > 0) return primary.join(' · ')

    const notes = data.recentNotes?.length || 0
    if (notes > 0) return pluralize(notes, 'note')

    const reading = data.reading?.length || 0
    if (reading > 0) return pluralize(reading, 'book')

    if (data.flock) {
      if (data.flock.todayEggs > 0) {
        return `${pluralize(data.flock.todayEggs, 'egg')} today`
      }
      if (data.flock.weekEggs > 0) return `${data.flock.weekEggs} this week`
      if (data.flock.activeBirds > 0) {
        return pluralize(data.flock.activeBirds, 'active bird')
      }
    }

    if (data.fitness) {
      if (data.fitness.calories != null) {
        return `${Math.round(data.fitness.calories).toLocaleString()} kcal`
      }
      if (data.fitness.loginStreak != null && data.fitness.loginStreak > 0) {
        return `${data.fitness.loginStreak}-day streak`
      }
    }

    return null
  }, [data])

  if (!text) return null

  return <p className="text-center text-sm text-white/55">{text}</p>
}

export default GlanceLine

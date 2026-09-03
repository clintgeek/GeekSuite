import { motion } from 'framer-motion'
import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { REDUCED_MOTION } from '../constants'
import Module from './Module'
import TaskRow from './TaskRow'
import FitnessModule from './FitnessModule'
import ReadingModule from './ReadingModule'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: REDUCED_MOTION ? 0 : 0.05,
      duration: REDUCED_MOTION ? 0 : 0.25,
    },
  },
}

const Skeleton = ({ className = '' }) => (
  <div className={`mod p-4 flex flex-col gap-3 ${className}`} aria-hidden="true">
    <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-48 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-40 bg-white/10 rounded animate-pulse" />
  </div>
)

const GroupLabel = ({ children }) => (
  <div className="label !text-[10px] !text-ink-3 pt-2 first:pt-0">{children}</div>
)

// Short due label for an upcoming task: weekday within the week, else "Sep 12".
const upcomingLabel = (task, todayIso) => {
  if (!task.dueDate) return null
  const due = new Date(task.dueDate)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date(`${todayIso}T00:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return due.toLocaleDateString('en-US', { weekday: 'short' })
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Tasks fill the left two-thirds and stretch to the height of Fitness and
// Reading stacked on the right; the task list scrolls inside that height.
const ModuleGrid = () => {
  const { data, loading } = useGlance()
  const { status } = useSession()
  const { settings } = useSettings()
  const on = settings.modules

  if (status !== 'in') return null

  const tasks = data?.tasks
  const overdue = tasks?.overdue || []
  const todayRows = [...(tasks?.events || []), ...(tasks?.due || [])]
  const upcoming = tasks?.upcoming || []
  const total = overdue.length + todayRows.length + upcoming.length

  const hasTasks = on.today && total > 0
  const hasReading = on.reading && data?.reading?.length > 0
  const hasFitness =
    on.fitness &&
    data?.fitness != null &&
    (data.fitness.calories != null ||
      data.fitness.calorieGoal != null ||
      data.fitness.mealsLogged > 0 ||
      data.fitness.loginStreak > 0)
  const hasSide = hasFitness || hasReading

  const taskFoot =
    tasks && (tasks.completedCount > 0 || tasks.blockedCount > 0) ? (
      <>
        {tasks.completedCount > 0 && <span>{tasks.completedCount} completed today</span>}
        {tasks.blockedCount > 0 && <span>{tasks.blockedCount} blocked</span>}
      </>
    ) : null

  if (loading && !data) {
    return (
      <div className="row with-side">
        <Skeleton className="mod-tasks" />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (!hasTasks && !hasSide) return null

  return (
    <motion.div
      className={`row ${hasTasks && hasSide ? 'with-side' : ''}`}
      initial={REDUCED_MOTION ? false : 'hidden'}
      animate="visible"
      variants={containerVariants}
    >
      {hasTasks && (
        <Module
          label="Tasks"
          count={total}
          className="mod-tasks"
          link={{ label: 'BujoGeek', href: 'https://bujogeek.clintgeek.com/' }}
          foot={taskFoot}
        >
          {overdue.length > 0 && (
            <>
              <GroupLabel>Overdue</GroupLabel>
              {overdue.map((task) => (
                <TaskRow key={task.id} task={task} late today={data.date} />
              ))}
            </>
          )}
          {todayRows.length > 0 && (
            <>
              <GroupLabel>Today</GroupLabel>
              {todayRows.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <GroupLabel>Upcoming</GroupLabel>
              {upcoming.map((task) => (
                <TaskRow key={task.id} task={task} aside={upcomingLabel(task, data.date)} />
              ))}
            </>
          )}
        </Module>
      )}

      {hasFitness && <FitnessModule fitness={data.fitness} />}

      {hasReading && <ReadingModule book={data.reading[0]} />}
    </motion.div>
  )
}

export default ModuleGrid

import { motion } from 'framer-motion'
import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { REDUCED_MOTION } from '../constants'
import Module from './Module'
import TaskRow from './TaskRow'
import FitnessModule from './FitnessModule'
import ReadingModule from './ReadingModule'

const MAX_TASK_ROWS = 8

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

const Skeleton = ({ span }) => (
  <div className="mod p-4 flex flex-col gap-3" style={{ '--span': span }} aria-hidden="true">
    <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-48 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-40 bg-white/10 rounded animate-pulse" />
  </div>
)

// One row, three panels, equal height: Tasks · Fitness · Reading.
// Signed out, nothing renders here (weather lives in the hero).
const ModuleGrid = () => {
  const { data, loading } = useGlance()
  const { status } = useSession()
  const { settings } = useSettings()
  const on = settings.modules

  if (status !== 'in') return null

  const tasks = data?.tasks
  const rows = tasks
    ? [
        ...tasks.events.map((t) => ({ task: t, late: false })),
        ...tasks.due.map((t) => ({ task: t, late: false })),
        ...tasks.overdue.map((t) => ({ task: t, late: true })),
      ]
    : []
  const hasTasks = on.today && rows.length > 0
  const hasReading = on.reading && data?.reading?.length > 0
  const hasFitness =
    on.fitness &&
    data?.fitness != null &&
    (data.fitness.calories != null ||
      data.fitness.calorieGoal != null ||
      data.fitness.mealsLogged > 0 ||
      data.fitness.loginStreak > 0)

  const shown = rows.slice(0, MAX_TASK_ROWS)
  const hidden = rows.length - shown.length

  const taskFoot =
    tasks && (tasks.completedCount > 0 || tasks.blockedCount > 0 || hidden > 0) ? (
      <>
        {tasks.completedCount > 0 && <span>{tasks.completedCount} completed</span>}
        {tasks.blockedCount > 0 && <span>{tasks.blockedCount} blocked</span>}
        {hidden > 0 && (
          <a
            href="https://bujogeek.clintgeek.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-ink-2 hover:text-accent transition-colors no-underline"
          >
            +{hidden} more
          </a>
        )}
      </>
    ) : null

  if (loading && !data) {
    return (
      <div className="grid grid-cols-12 gap-3.5 mt-6 items-stretch">
        <Skeleton span={6} />
        <Skeleton span={3} />
        <Skeleton span={3} />
      </div>
    )
  }

  if (!hasTasks && !hasFitness && !hasReading) return null

  return (
    <motion.div
      className="grid grid-cols-12 gap-3.5 mt-6 items-stretch"
      initial={REDUCED_MOTION ? false : 'hidden'}
      animate="visible"
      variants={containerVariants}
    >
      {hasTasks && (
        <Module
          label="Tasks"
          count={rows.length}
          span={6}
          link={{ label: 'BujoGeek', href: 'https://bujogeek.clintgeek.com/' }}
          foot={taskFoot}
        >
          {shown.map(({ task, late }) => (
            <TaskRow key={task.id} task={task} late={late} today={data.date} />
          ))}
        </Module>
      )}

      {hasFitness && <FitnessModule fitness={data.fitness} />}

      {hasReading && <ReadingModule book={data.reading[0]} />}
    </motion.div>
  )
}

export default ModuleGrid

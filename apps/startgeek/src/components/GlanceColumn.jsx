import { motion } from 'framer-motion'
import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { REDUCED_MOTION, ANIMATION } from '../constants'
import GlanceLine from './GlanceLine'
import TaskRow from './TaskRow'
import HabitRow from './HabitRow'
import NoteRow from './NoteRow'
import BookRow from './BookRow'
import FitnessLine from './FitnessLine'
import FlockLine from './FlockLine'

const sectionVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: REDUCED_MOTION ? 0 : 0.25,
      ease: ANIMATION.EASE,
    },
  },
}

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

const Skeleton = () => (
  <div className="w-full flex flex-col items-center gap-3 py-2">
    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
  </div>
)

const Section = ({ label, children }) => (
  <motion.div variants={sectionVariants} className="flex items-start gap-1">
    <div className="w-20 shrink-0 pt-0.5 pr-4 text-right text-sm text-white/40 leading-tight">
      {label}
    </div>
    <div className="flex-1 min-w-0 flex flex-col gap-2">{children}</div>
  </motion.div>
)

const GlanceColumn = () => {
  const { data, loading } = useGlance()
  const { status } = useSession()

  if (status !== 'in') return null
  if (loading) return <Skeleton />
  if (!data) return null

  const hasToday =
    data.tasks?.due?.length > 0 ||
    data.tasks?.overdue?.length > 0 ||
    data.tasks?.events?.length > 0

  const hasHabits = data.habits?.length > 0
  const hasNotes = data.recentNotes?.length > 0
  const hasReading = data.reading?.length > 0

  const hasFitness =
    data.fitness != null &&
    (data.fitness.calories != null ||
      data.fitness.calorieGoal != null ||
      data.fitness.mealsLogged > 0 ||
      (data.fitness.loginStreak != null && data.fitness.loginStreak > 0))

  const hasFlock = data.flock != null

  const hasAny =
    hasToday ||
    hasHabits ||
    hasNotes ||
    hasReading ||
    hasFitness ||
    hasFlock

  if (!hasAny) return null

  return (
    <div className="w-full">
      <GlanceLine data={data} />
      <motion.div
        className="mt-4 w-full flex flex-col gap-4"
        initial={REDUCED_MOTION ? false : 'hidden'}
        animate="visible"
        variants={containerVariants}
      >
        {hasToday && (
          <Section label="Today">
            {data.tasks.due.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {data.tasks.overdue.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {data.tasks.events.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </Section>
        )}

        {hasHabits && (
          <Section label="Habits">
            {data.habits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} date={data.date} />
            ))}
          </Section>
        )}

        {hasNotes && (
          <Section label="Notes">
            {data.recentNotes.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </Section>
        )}

        {hasReading && (
          <Section label="Reading">
            {data.reading.map((book) => (
              <BookRow key={book.id} book={book} />
            ))}
          </Section>
        )}

        {hasFitness && (
          <Section label="Fitness">
            <FitnessLine fitness={data.fitness} />
          </Section>
        )}

        {hasFlock && (
          <Section label="Flock">
            <FlockLine flock={data.flock} />
          </Section>
        )}
      </motion.div>
    </div>
  )
}

export default GlanceColumn

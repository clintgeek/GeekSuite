import { motion } from 'framer-motion'
import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { REDUCED_MOTION } from '../constants'
import Module from './Module'
import TaskRow from './TaskRow'
import HabitRow from './HabitRow'
import NoteRow from './NoteRow'
import BookRow from './BookRow'
import FitnessModule from './FitnessModule'
import WeekModule from './WeekModule'

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
  <div className="mod col-span-6 h-32 p-4 flex flex-col gap-3" style={{ '--span': 6 }} aria-hidden="true">
    <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-48 bg-white/10 rounded animate-pulse" />
    <div className="h-3 w-40 bg-white/10 rounded animate-pulse" />
  </div>
)

// The 12-column console grid. Dense packing so a switched-off module lets
// the rest flow up. Week works logged out; everything else needs a session.
const ModuleGrid = () => {
  const { data, loading } = useGlance()
  const { status } = useSession()
  const { settings } = useSettings()
  const on = settings.modules
  const signedIn = status === 'in'

  const tasks = data?.tasks
  const hasToday =
    signedIn && on.today && (tasks?.due?.length > 0 || tasks?.overdue?.length > 0 || tasks?.events?.length > 0)
  const hasHabits = signedIn && on.habits && data?.habits?.length > 0
  const hasNotes = signedIn && on.notes && data?.recentNotes?.length > 0
  const hasReading = signedIn && on.reading && data?.reading?.length > 0
  const hasFitness =
    signedIn &&
    on.fitness &&
    data?.fitness != null &&
    (data.fitness.calories != null ||
      data.fitness.calorieGoal != null ||
      data.fitness.mealsLogged > 0 ||
      data.fitness.loginStreak > 0)

  const todayCount = (tasks?.due?.length || 0) + (tasks?.overdue?.length || 0) + (tasks?.events?.length || 0)
  const habitsDone = data?.habits?.filter((h) => h.doneToday).length || 0

  const todayFoot =
    tasks && (tasks.completedCount > 0 || tasks.blockedCount > 0) ? (
      <>
        {tasks.completedCount > 0 && <span>{tasks.completedCount} completed</span>}
        {tasks.blockedCount > 0 && <span>{tasks.blockedCount} blocked</span>}
      </>
    ) : null

  return (
    <motion.div
      className="grid grid-cols-12 gap-3.5 mt-6"
      style={{ gridAutoFlow: 'dense' }}
      initial={REDUCED_MOTION ? false : 'hidden'}
      animate="visible"
      variants={containerVariants}
    >
      {signedIn && loading && !data && <Skeleton />}

      {hasToday && (
        <Module
          label="Today"
          count={todayCount}
          span={6}
          link={{ label: 'BujoGeek', href: 'https://bujogeek.clintgeek.com/' }}
          foot={todayFoot}
        >
          {tasks.events.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
          {tasks.due.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
          {tasks.overdue.map((task) => (
            <TaskRow key={task.id} task={task} late today={data.date} />
          ))}
        </Module>
      )}

      {hasHabits && (
        <Module label="Habits" count={`${habitsDone} / ${data.habits.length}`} span={3}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {data.habits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} date={data.date} />
            ))}
          </div>
        </Module>
      )}

      {hasFitness && <FitnessModule fitness={data.fitness} />}

      {hasNotes && (
        <Module
          label="Notes"
          count="recent"
          span={4}
          link={{ label: 'NoteGeek', href: 'https://notegeek.clintgeek.com' }}
        >
          {data.recentNotes.map((note) => (
            <NoteRow key={note.id} note={note} />
          ))}
        </Module>
      )}

      {hasReading && (
        <Module
          label="Reading"
          count={data.reading.length}
          span={5}
          link={{ label: 'BookGeek', href: 'https://bookgeek.clintgeek.com' }}
          className="[&>.mod-body]:gap-3.5"
        >
          {data.reading.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
        </Module>
      )}

      {on.week && <WeekModule />}
    </motion.div>
  )
}

export default ModuleGrid

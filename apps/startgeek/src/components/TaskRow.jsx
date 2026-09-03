import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { UPDATE_TASK_STATUS } from '../lib/queries'

const DOT_COLOR = {
  '!': 'text-accent',
  '@': 'text-sky',
  '*': 'text-critical',
  '?': 'text-[#c9a0f0]',
  '#': 'text-[#7bc49a]',
}

const dotColor = (task, late) => {
  if (late) return 'text-critical'
  if (task.signifier && DOT_COLOR[task.signifier]) return DOT_COLOR[task.signifier]
  if (task.priority === 1) return 'text-accent'
  if (task.priority === 2) return 'text-ink-2'
  return 'text-ink-3'
}

const PRIORITY_TAG = { 1: '!high', 2: '!medium', 3: '!low' }

// Clock time for an event when its due date carries one. Midnight means
// "no time was set" and shows nothing.
const eventTime = (task) => {
  if (task.signifier !== '@' || !task.dueDate) return null
  const d = new Date(task.dueDate)
  if (Number.isNaN(d.getTime())) return null
  if (d.getHours() === 0 && d.getMinutes() === 0) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const daysLate = (task, today) => {
  if (!task.dueDate || !today) return null
  const due = new Date(task.dueDate)
  const day = new Date(`${today}T00:00:00`)
  if (Number.isNaN(due.getTime()) || Number.isNaN(day.getTime())) return null
  const n = Math.max(1, Math.round((day - due) / 86400000))
  return `${n}d late`
}

const TaskRow = ({ task, late = false, today, aside = null }) => {
  const { refetch } = useGlance()
  const { markOut } = useSession()

  const handleToggle = async () => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      await gql(UPDATE_TASK_STATUS, { id: task.id, status: nextStatus })
      refetch()
    } catch (err) {
      if (err instanceof UnauthorizedError) markOut()
    }
  }

  const color = dotColor(task, late)
  const isEvent = task.signifier === '@'
  const time = eventTime(task)
  const lateTag = late ? daysLate(task, today) : null
  const priorityTag = !late && task.priority === 1 ? PRIORITY_TAG[1] : null

  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <button
        type="button"
        onClick={handleToggle}
        className={`dot ${color} ${isEvent ? 'event' : ''} ${task.status === 'completed' ? 'on' : ''}`}
        aria-label={task.status === 'completed' ? 'Mark task pending' : 'Mark task complete'}
      />
      <a
        href="https://bujogeek.clintgeek.com/"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex-1 min-w-0 text-sm leading-snug transition-colors no-underline ${
          late ? 'text-ink-2 hover:text-ink' : 'text-ink hover:text-white'
        }`}
      >
        <span className="break-words">{task.content}</span>
        {priorityTag && <span className="ml-1.5 font-mono text-[10px] text-ink-3">{priorityTag}</span>}
        {task.tags?.length > 0 &&
          task.tags.map((tag) => (
            <span key={tag} className="ml-1.5 font-mono text-[10px] text-ink-3">
              #{tag}
            </span>
          ))}
        {lateTag && (
          <span className="ml-1.5 align-[1px] font-mono text-[10px] tracking-[0.06em] uppercase px-1.5 py-px rounded border border-[rgba(240,113,120,0.4)] text-critical">
            {lateTag}
          </span>
        )}
      </a>
      {(time || aside) && (
        <span className="font-mono text-[11px] text-ink-3 tnum pt-0.5 shrink-0">{time || aside}</span>
      )}
    </div>
  )
}

export default TaskRow

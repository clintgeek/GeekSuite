import { useGlance } from '../hooks/useGlance'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { UPDATE_TASK_STATUS } from '../lib/queries'

const DOT_COLOR = {
  '!': 'text-amber-400',
  '@': 'text-sky-400',
  '*': 'text-rose-400',
  '?': 'text-violet-400',
  '#': 'text-emerald-400',
}

const dotColor = (task) => {
  if (task.signifier && DOT_COLOR[task.signifier]) return DOT_COLOR[task.signifier]
  if (task.priority === 1) return 'text-amber-400'
  if (task.priority === 2) return 'text-white/50'
  return 'text-white/30'
}

const TaskRow = ({ task }) => {
  const { refetch } = useGlance()
  const { markOut } = useSession()

  const handleToggle = async () => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      await gql(UPDATE_TASK_STATUS, { id: task.id, status: nextStatus })
      refetch()
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        markOut()
      }
    }
  }

  const color = dotColor(task)

  return (
    <div className="group flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 -ml-1 p-1.5 rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 transition-colors"
        aria-label="Toggle task status"
      >
        <span
          className={`block w-2 h-2 rounded-full border transition-colors ${color} ${
            task.status === 'completed'
              ? 'bg-current border-current'
              : 'bg-transparent border-current'
          }`}
        />
      </button>
      <a
        href="https://bujogeek.clintgeek.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 text-sm text-white/85 hover:text-white transition-colors"
      >
        <span className="break-words">{task.content}</span>
        {task.tags?.length > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block text-[10px] text-white/40 leading-tight px-1.5 py-0.5 rounded-full bg-white/[0.06]"
              >
                #{tag}
              </span>
            ))}
          </span>
        )}
      </a>
    </div>
  )
}

export default TaskRow

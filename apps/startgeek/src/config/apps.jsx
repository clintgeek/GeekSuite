import { NotesIcon, TodoIcon, FitnessIcon, BooksIcon, GamesIcon, NewsIcon } from '../components/icons'

// GeekSuite App Registry
// Central config for all app URLs, icons, and metadata.
// Keep the dock lean — one row of apps, no secondary overflow.

export const PRIMARY_APPS = [
  { id: 'notegeek',    icon: <NotesIcon />,   label: 'Notes',   url: 'https://notegeek.clintgeek.com' },
  { id: 'todogeek',    icon: <TodoIcon />,    label: 'Todo',    url: 'https://todogeek.clintgeek.com' },
  { id: 'fitnessgeek', icon: <FitnessIcon />, label: 'Fitness', url: 'https://fitnessgeek.clintgeek.com' },
  { id: 'bookgeek',    icon: <BooksIcon />,   label: 'Books',   url: 'https://bookgeek.clintgeek.com' },
  { id: 'gamegeek',    icon: <GamesIcon />,   label: 'Games',   url: 'https://gamegeek.clintgeek.com' },
  { id: 'newsgeek',    icon: <NewsIcon />,    label: 'News',    url: 'https://newsgeek.clintgeek.com' },
]

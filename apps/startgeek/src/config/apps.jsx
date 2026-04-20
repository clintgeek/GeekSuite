import { NotesIcon, BujoIcon, FitnessIcon, FlockIcon, BooksIcon } from '../components/icons'

// GeekSuite App Registry
// Central config for all app URLs, icons, and metadata.
// Keep the dock lean — one row of apps, no secondary overflow.

export const PRIMARY_APPS = [
  { id: 'notegeek',    icon: <NotesIcon />,   label: 'Notes',   url: 'https://notegeek.clintgeek.com' },
  { id: 'bujogeek',    icon: <BujoIcon />,    label: 'Bujo',    url: 'https://bujogeek.clintgeek.com' },
  { id: 'fitnessgeek', icon: <FitnessIcon />, label: 'Fitness', url: 'https://fitnessgeek.clintgeek.com' },
  { id: 'flockgeek',   icon: <FlockIcon />,   label: 'Flock',   url: 'https://flockgeek.clintgeek.com' },
  { id: 'bookgeek',    icon: <BooksIcon />,   label: 'Books',   url: 'https://bookgeek.clintgeek.com' },
]

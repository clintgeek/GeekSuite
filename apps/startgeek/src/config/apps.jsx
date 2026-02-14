import { NotesIcon, BujoIcon, FitnessIcon, FlockIcon, GridIcon, BooksIcon, PhotosIcon, MusicIcon, BabelIcon, StoryIcon } from '../components/icons'

// GeekSuite App Registry
// Central config for all app URLs, icons, and metadata

export const PRIMARY_APPS = [
  { id: 'notegeek', icon: <NotesIcon />, label: 'Notes', url: 'https://notegeek.clintgeek.com' },
  { id: 'bujogeek', icon: <BujoIcon />, label: 'Bujo', url: 'https://bujogeek.clintgeek.com' },
  { id: 'fitnessgeek', icon: <FitnessIcon />, label: 'Fitness', url: 'https://fitnessgeek.clintgeek.com' },
  { id: 'flockgeek', icon: <FlockIcon />, label: 'Flock', url: 'https://flockgeek.clintgeek.com' },
]

export const SECONDARY_APPS = [
  { id: 'bookgeek', icon: <BooksIcon />, label: 'Books', url: 'https://bookgeek.clintgeek.com' },
  { id: 'photogeek', icon: <PhotosIcon />, label: 'Photos', url: 'https://photogeek.clintgeek.com' },
  { id: 'musicgeek', icon: <MusicIcon />, label: 'Music', url: 'https://musicgeek.clintgeek.com' },
  { id: 'babelgeek', icon: <BabelIcon />, label: 'Babel', url: 'https://babelgeek.clintgeek.com' },
  { id: 'storygeek', icon: <StoryIcon />, label: 'Story', url: 'https://storygeek.clintgeek.com' },
]

export const MORE_BUTTON = {
  icon: <GridIcon />,
  label: 'More',
}

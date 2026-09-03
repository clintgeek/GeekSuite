const FlockLine = ({ flock }) => {
  const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <span className="text-sm text-white/85">
      {pluralize(flock.activeBirds, 'active bird')} ·{' '}
      {pluralize(flock.todayEggs, 'egg')} today · {flock.weekEggs} this week
    </span>
  )
}

export default FlockLine

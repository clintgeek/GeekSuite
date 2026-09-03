const HelpButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-label="Open command box help"
      className="w-[26px] h-[26px] shrink-0 rounded-full grid place-items-center border border-hair-strong font-mono text-xs text-ink-3 hover:text-ink transition-colors"
    >
      ?
    </button>
  )
}

export default HelpButton

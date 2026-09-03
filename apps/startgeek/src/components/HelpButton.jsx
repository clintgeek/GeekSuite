const HelpButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-label="Open command box help"
      className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        background: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <span className="text-sm font-semibold">?</span>
    </button>
  )
}

export default HelpButton

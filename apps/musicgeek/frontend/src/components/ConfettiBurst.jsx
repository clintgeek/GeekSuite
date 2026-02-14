import { useEffect, useState } from 'react';

// Lightweight confetti burst using absolutely positioned emoji elements.
export default function ConfettiBurst({ triggerKey }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    // Generate a new burst when triggerKey changes.
    const count = 40;
    const newPieces = Array.from({ length: count }, (_, i) => ({
      id: `${triggerKey}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.2,
      duration: 2 + Math.random() * 1.5,
      rotate: Math.random() * 360,
      emoji: ['🎵', '✨', '🎉', '⭐', '🎶'][Math.floor(Math.random() * 5)],
    }));
    setPieces(newPieces);
    const timeout = setTimeout(() => setPieces([]), 3500); // Auto-clear
    return () => clearTimeout(timeout);
  }, [triggerKey]);

  return (
    <div className="confetti-burst" aria-hidden="true" style={styles.container}>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            ...styles.piece,
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        >
          {p.emoji}
        </span>
      ))}
      <style>{keyframes}</style>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  piece: {
    position: 'absolute',
    top: '-10%',
    fontSize: '1.25rem',
    animationName: 'confettiFall',
    animationTimingFunction: 'linear',
    animationFillMode: 'forwards',
  },
};

const keyframes =
  '@keyframes confettiFall {\n  0% { transform: translateY(0) scale(1); opacity: 1; }\n  90% { opacity: 1; }\n  100% { transform: translateY(110vh) scale(0.9); opacity: 0; }\n}';

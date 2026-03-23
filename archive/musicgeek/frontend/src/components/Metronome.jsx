import { useState, useEffect, useRef } from 'react';
import './Metronome.css';

const TIME_SIGNATURES = [
  { label: '4/4', beats: 4, name: 'Common Time' },
  { label: '3/4', beats: 3, name: 'Waltz' },
  { label: '2/4', beats: 2, name: 'March' },
  { label: '6/8', beats: 6, name: 'Compound' },
  { label: '5/4', beats: 5, name: 'Quintuple' },
  { label: '7/8', beats: 7, name: 'Odd Time' },
];

const BASE_VOLUME = 0.5;

const Metronome = ({ initialTempo = 120, compact = true }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(initialTempo);
  const [timeSignature] = useState(TIME_SIGNATURES[0]);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [pendingTempo, setPendingTempo] = useState(null);

  const audioContextRef = useRef(null);
  const intervalIdRef = useRef(null);
  const beatCountRef = useRef(0);
  const subBeatCountRef = useRef(0);

  // Fixed subdivision for v1
  const subdivision = 1;

  // Initialize Web Audio API
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Schedule a single click
  const scheduleNote = (time, isDownbeat, isSubdivision = false) => {
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different frequencies for different beats
    if (isDownbeat) {
      oscillator.frequency.value = 1000; // Downbeat (first beat)
      gainNode.gain.value = BASE_VOLUME * 1.2;
    } else if (isSubdivision) {
      oscillator.frequency.value = 600; // Subdivision
      gainNode.gain.value = BASE_VOLUME * 0.4;
    } else {
      oscillator.frequency.value = 800; // Regular beat
      gainNode.gain.value = BASE_VOLUME * 0.8;
    }

    oscillator.start(time);
    oscillator.stop(time + 0.05); // Short click sound
  };

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const clearTimer = () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };

    if (!isPlaying) {
      clearTimer();
      setCurrentBeat(0);
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    beatCountRef.current = 0;
    subBeatCountRef.current = 0;

    const intervalMs = (60 * 1000) / (tempo * (subdivision || 1));

    const tick = () => {
      const isDownbeat = beatCountRef.current === 0 && subBeatCountRef.current === 0;
      const isSubBeat = subdivision > 1 && subBeatCountRef.current > 0;

      const now = ctx.currentTime;
      scheduleNote(now + 0.01, isDownbeat, isSubBeat);

      if (!isSubBeat) {
        setCurrentBeat(beatCountRef.current);
        // Trigger pulse animation
        const pulseCircle = document.querySelector('.pulse-circle');
        if (pulseCircle) {
          pulseCircle.classList.add('pulse-circle--beat');
          setTimeout(() => {
            pulseCircle.classList.remove('pulse-circle--beat');
          }, 100);
        }
      }

      subBeatCountRef.current += 1;
      if (subBeatCountRef.current >= subdivision) {
        subBeatCountRef.current = 0;
        beatCountRef.current = (beatCountRef.current + 1) % timeSignature.beats;

        // Apply pending tempo on beat boundary
        if (pendingTempo !== null) {
          setTempo(pendingTempo);
          setPendingTempo(null);
        }
      }
    };

    clearTimer();
    intervalIdRef.current = setInterval(tick, intervalMs);

    return clearTimer;
  }, [isPlaying, tempo, subdivision, timeSignature.beats, pendingTempo]);

  const togglePlay = () => {
    if (!isPlaying) {
      // Immediate click on start
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
      if (ctx) {
        scheduleNote(ctx.currentTime + 0.01, true, false); // Immediate downbeat click
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleTempoDecrease = () => {
    const newTempo = Math.max(40, tempo - 5);
    if (isPlaying) {
      setPendingTempo(newTempo);
    } else {
      setTempo(newTempo);
    }
  };

  const handleTempoIncrease = () => {
    const newTempo = Math.min(240, tempo + 5);
    if (isPlaying) {
      setPendingTempo(newTempo);
    } else {
      setTempo(newTempo);
    }
  };

  return (
    <div className={`metronome ${compact ? 'metronome--compact' : ''}`}>
      <div className={`pulse-circle ${currentBeat === 0 ? 'pulse-circle--accent' : ''}`} />

      <div className="beat-count-row">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={currentBeat === n - 1 ? 'beat-count--active' : ''}>
            {n}
          </span>
        ))}
      </div>

      <div className="metronome-header-row">
        <div className="metronome-tempo-note">
          <div className="tempo-display">
            <div className="tempo-value">{tempo}</div>
            <div className="tempo-label">BPM</div>
          </div>
          <div className="note-type-label">Quarter</div>
        </div>
        <button onClick={togglePlay} className={`play-btn-compact ${isPlaying ? 'playing' : ''}`}>
          {isPlaying ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="tempo-controls-row">
        <button onClick={handleTempoDecrease} className="tempo-btn">
          −
        </button>
        <div className="tempo-display">
          <div className="tempo-value">{tempo}</div>
          <div className="tempo-label">BPM</div>
        </div>
        <button onClick={handleTempoIncrease} className="tempo-btn">
          +
        </button>
      </div>
    </div>
  );
};

export default Metronome;

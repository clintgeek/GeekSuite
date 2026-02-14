import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInstrument } from '../context/InstrumentContext';
import Metronome from './Metronome';
import './PracticeToolbar.css';

const PracticeToolbar = () => {
  const [showMetronome, setShowMetronome] = useState(false);
  const [metronomePosition, setMetronomePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeInstrument } = useInstrument();
  const panelRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleTunerClick = () => {
    if (!activeInstrument) {
      alert('Please select an instrument first');
      navigate('/instruments');
      return;
    }

    // Navigate to instrument-specific tuner
    const tunerPath = `/instrument/${activeInstrument.name}/tuner`;
    navigate(tunerPath);
  };

  const handleMetronomeClick = () => {
    setShowMetronome((prev) => !prev);
  };

  useEffect(() => {
    if (!showMetronome) {
      setIsDragging(false);
      return;
    }

    if (metronomePosition.x !== 0 || metronomePosition.y !== 0) {
      return;
    }

    const positionPanel = () => {
      if (!panelRef.current || typeof window === 'undefined') return;
      const panelWidth = panelRef.current.offsetWidth || 360;
      const panelHeight = panelRef.current.offsetHeight || 480;

      setMetronomePosition({
        x: Math.max(16, window.innerWidth - panelWidth - 24),
        y: Math.max(16, window.innerHeight - panelHeight - 24),
      });
    };

    // wait next frame so ref has dimensions
    requestAnimationFrame(positionPanel);
  }, [showMetronome, metronomePosition.x, metronomePosition.y]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event) => {
      if (!panelRef.current || typeof window === 'undefined') return;

      const panelWidth = panelRef.current.offsetWidth;
      const panelHeight = panelRef.current.offsetHeight;
      const maxX = window.innerWidth - panelWidth - 16;
      const maxY = window.innerHeight - panelHeight - 16;

      const nextX = Math.min(Math.max(16, event.clientX - dragOffset.current.x), maxX);
      const nextY = Math.min(Math.max(16, event.clientY - dragOffset.current.y), maxY);

      setMetronomePosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  // Don't show toolbar on certain pages
  const hiddenPaths = ['/', '/login', '/register', '/instruments'];
  if (hiddenPaths.includes(location.pathname)) {
    return null;
  }

  const handleDragStart = (event) => {
    if (!panelRef.current) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setIsDragging(true);
    event.preventDefault();
  };

  const closeMetronome = () => {
    setShowMetronome(false);
  };

  return (
    <>
      {/* Floating Toolbar */}
      <div className="practice-toolbar">
        <button
          className="practice-button practice-button--primary"
          onClick={handleTunerClick}
          title="Open Tuner"
        >
          <span className="practice-button__title">Open Tuner</span>
        </button>
        <button className="practice-button" onClick={handleMetronomeClick} title="Toggle Metronome">
          <span className="practice-button__title">Metronome</span>
        </button>
      </div>

      {/* Metronome PiP Panel */}
      {showMetronome && (
        <div
          className={`metronome-pip ${isDragging ? 'metronome-pip--dragging' : ''}`}
          style={{
            transform: `translate(${metronomePosition.x}px, ${metronomePosition.y}px)`,
          }}
          ref={panelRef}
        >
          <div className="metronome-pip__header" onPointerDown={handleDragStart}>
            <div>
              <p className="metronome-pip__title">Metronome</p>
              <p className="metronome-pip__subtitle">Drag to reposition • stays on top</p>
            </div>
            <button
              className="metronome-pip__close"
              onClick={closeMetronome}
              aria-label="Close metronome"
            >
              ×
            </button>
          </div>
          <div className="metronome-pip__content">
            <Metronome />
          </div>
        </div>
      )}
    </>
  );
};

export default PracticeToolbar;

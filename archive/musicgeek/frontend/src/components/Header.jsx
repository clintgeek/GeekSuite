import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserProgress } from '../context/UserProgressContext';
import { useInstrument } from '../context/InstrumentContext';
import { useTheme } from '../context/ThemeContext';
import Metronome from './Metronome';
import Tuner from './Tuner';
import ChordReference from './ChordReference';

export default function Header() {
  const { isAuthenticated, currentUser, logout } = useAuth();
  const { totalXP, level } = useUserProgress();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeInstrument } = useInstrument();
  const { theme, toggleTheme } = useTheme();

  const [showMetronome, setShowMetronome] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showChordReference, setShowChordReference] = useState(false);
  const [metronomePosition, setMetronomePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleTunerClick = () => {
    if (!activeInstrument) {
      alert('Please select an instrument first');
      navigate('/instruments');
      return;
    }

    setShowTuner((prev) => !prev);
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

  const hiddenPaths = ['/', '/login', '/register'];
  const showPracticeControls = isAuthenticated && !hiddenPaths.includes(location.pathname);

  return (
    <>
      <header className="header">
        <div className="container">
          <div className="header-content">
            <Link to="/" className="logo">
              <span className="logo-icon">🎸</span>
              <span className="logo-text">MusicGeek</span>
            </Link>

            <nav className="nav">
              {isAuthenticated ? (
                <>
                  <Link to="/instruments" className="nav-link">
                    Instruments
                  </Link>
                  <Link to="/lessons" className="nav-link">
                    Lessons
                  </Link>
                  <Link to="/profile" className="nav-link">
                    Profile
                  </Link>

                  {showPracticeControls && (
                    <div className="header-practice-controls">
                      <button
                        className={`header-practice-button ${showTuner ? 'header-practice-button--active' : ''}`}
                        onClick={handleTunerClick}
                        type="button"
                      >
                        Tuner
                      </button>
                      <button
                        className={`header-practice-button ${showMetronome ? 'header-practice-button--active' : ''}`}
                        onClick={handleMetronomeClick}
                        type="button"
                      >
                        Metronome
                      </button>
                      {activeInstrument?.name.toLowerCase() === 'guitar' && (
                        <button
                          className={`header-practice-button ${showChordReference ? 'header-practice-button--active' : ''}`}
                          onClick={() => setShowChordReference((prev) => !prev)}
                          type="button"
                        >
                          Chords
                        </button>
                      )}
                    </div>
                  )}

                  <div className="user-info">
                    <span className="user-level">Level {level}</span>
                    <span className="user-xp">{totalXP} XP</span>
                    <span className="user-name">
                      {currentUser?.display_name || currentUser?.username}
                    </span>
                    <button onClick={handleLogout} className="btn-logout" type="button">
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="nav-link">
                    Log In
                  </Link>
                  <Link to="/register" className="btn-primary">
                    Sign Up
                  </Link>
                </>
              )}

              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

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
              type="button"
            >
              ×
            </button>
          </div>
          <div className="metronome-pip__content">
            <Metronome />
          </div>
        </div>
      )}

      {showTuner && (
        <div className="tuner-overlay">
          <div className="tuner-overlay__backdrop" onClick={() => setShowTuner(false)} />
          <div className="tuner-overlay__content">
            <button
              className="tuner-overlay__close"
              onClick={() => setShowTuner(false)}
              aria-label="Close tuner"
              type="button"
            >
              ×
            </button>
            <Tuner tuningConfig={activeInstrument?.tunings?.[0]} />
          </div>
        </div>
      )}

      {showChordReference && (
        <div className="tuner-overlay">
          <div className="tuner-overlay__backdrop" onClick={() => setShowChordReference(false)} />
          <div className="tuner-overlay__content">
            <button
              className="tuner-overlay__close"
              onClick={() => setShowChordReference(false)}
              aria-label="Close chord reference"
              type="button"
            >
              ×
            </button>
            <ChordReference />
          </div>
        </div>
      )}
    </>
  );
}

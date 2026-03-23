import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstrument } from '../context/InstrumentContext';

export default function InstrumentSelectorPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const {
    instruments,
    userInstruments,
    addInstrument,
    switchInstrument,
    removeInstrument,
    refreshInstruments,
    isLoading,
  } = useInstrument();
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const loadUserInstruments = refreshInstruments;

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Debug logging
  useEffect(() => {
    console.log('Instruments:', instruments);
    console.log('User Instruments:', userInstruments);
    console.log('Is Loading:', isLoading);
  }, [instruments, userInstruments, isLoading]);

  const handleSelectInstrument = (instrument) => {
    setSelectedInstrument(instrument);
  };

  const handleAddInstrument = async () => {
    if (!selectedInstrument) return;

    try {
      setIsAdding(true);
      const result = await addInstrument(selectedInstrument.id, skillLevel, false);

      // Check if this was a previously removed instrument
      if (result.was_previous && result.previous_progress) {
        const { lessons_completed, total_practice_time } = result.previous_progress;
        const hours = Math.round(total_practice_time / 60);

        const continueMessage = `Welcome back! You previously had ${lessons_completed} lessons completed and ${hours} hours of practice.\n\nWould you like to:\n- Click OK to CONTINUE from where you left off\n- Click Cancel to START FRESH (reset all progress)`;

        const shouldContinue = confirm(continueMessage);

        if (!shouldContinue) {
          // User wants to start fresh
          await addInstrument(selectedInstrument.id, skillLevel, true);
          await loadUserInstruments();
        }
      }

      await switchInstrument(selectedInstrument.id);

      // Redirect to instrument tuner
      const instrumentPath = selectedInstrument.name.toLowerCase();
      navigate(`/instrument/${instrumentPath}/tuner`);
    } catch (err) {
      alert('Failed to add instrument: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleSwitchInstrument = async (instrument) => {
    try {
      await switchInstrument(instrument.instrument_id);
      const instrumentPath = instrument.name.toLowerCase();
      navigate(`/instrument/${instrumentPath}/tuner`);
    } catch (err) {
      alert('Failed to switch instrument: ' + err.message);
    }
  };

  const handleRemoveInstrument = async (e, instrumentId) => {
    e.stopPropagation(); // Prevent triggering the switch instrument click

    if (
      !confirm(
        'Are you sure you want to remove this instrument? Your progress will be preserved if you add it back later.'
      )
    ) {
      return;
    }

    try {
      setRemovingId(instrumentId);
      await removeInstrument(instrumentId);
    } catch (err) {
      alert('Failed to remove instrument: ' + err.message);
    } finally {
      setRemovingId(null);
    }
  };

  const availableInstruments = instruments.filter(
    (inst) => !userInstruments.some((ui) => ui.instrument_id === inst.id)
  );

  if (isLoading) {
    return (
      <div className="instrument-selector-page">
        <div className="container">
          <header className="page-header">
            <h1>Choose Your Instrument</h1>
            <p>Loading instruments...</p>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="instrument-selector-page">
      <div className="container">
        <header className="page-header">
          <h1>Choose Your Instrument</h1>
          <p>Select an instrument to start your musical journey</p>
        </header>

        {userInstruments.length > 0 && (
          <section className="my-instruments">
            <h2>My Instruments</h2>
            <div className="instruments-grid">
              {userInstruments.map((userInst) => (
                <div
                  key={userInst.instrument_id}
                  className={`instrument-card my-instrument ${userInst.is_active ? 'active' : ''} ${removingId === userInst.instrument_id ? 'removing' : ''}`}
                  onClick={() => handleSwitchInstrument(userInst)}
                >
                  {userInst.is_active && <div className="active-badge">✓ Active</div>}
                  <button
                    className="remove-instrument-btn"
                    onClick={(e) => handleRemoveInstrument(e, userInst.instrument_id)}
                    disabled={removingId === userInst.instrument_id}
                    title="Remove instrument"
                  >
                    {removingId === userInst.instrument_id ? '...' : '×'}
                  </button>
                  <div className="instrument-icon">{userInst.icon}</div>
                  <h3>{userInst.display_name}</h3>
                  <div className="instrument-stats">
                    <span className="stat">
                      <strong>{userInst.lessons_completed}</strong> lessons
                    </span>
                    <span className="stat">
                      <strong>{Math.round(userInst.total_practice_time / 60)}</strong> hours
                    </span>
                  </div>
                  <span className="skill-badge">{userInst.skill_level}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="available-instruments">
          <h2>Add New Instrument</h2>

          {availableInstruments.length === 0 ? (
            <p className="no-instruments">You’ve added all available instruments! Great job! 🎉</p>
          ) : (
            <div className="instruments-grid">
              {availableInstruments.map((instrument) => (
                <div
                  key={instrument.id}
                  className={`instrument-card ${selectedInstrument?.id === instrument.id ? 'selected' : ''}`}
                  onClick={() => handleSelectInstrument(instrument)}
                >
                  <div className="instrument-icon">{instrument.icon}</div>
                  <h3>{instrument.display_name}</h3>
                  <p className="instrument-description">{instrument.description}</p>
                  {instrument.tuner_enabled && (
                    <span className="feature-badge">🎵 Tuner Available</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedInstrument && (
            <div className="selection-panel">
              <div className="selection-content">
                <h3>Add {selectedInstrument.display_name}</h3>
                <p>What’s your current skill level?</p>

                <div className="skill-level-selector">
                  <label className={skillLevel === 'beginner' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="skill-level"
                      value="beginner"
                      checked={skillLevel === 'beginner'}
                      onChange={(e) => setSkillLevel(e.target.value)}
                    />
                    <div className="skill-option">
                      <strong>Beginner</strong>
                      <span>I’m just starting out</span>
                    </div>
                  </label>

                  <label className={skillLevel === 'intermediate' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="skill-level"
                      value="intermediate"
                      checked={skillLevel === 'intermediate'}
                      onChange={(e) => setSkillLevel(e.target.value)}
                    />
                    <div className="skill-option">
                      <strong>Intermediate</strong>
                      <span>I have some experience</span>
                    </div>
                  </label>

                  <label className={skillLevel === 'advanced' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="skill-level"
                      value="advanced"
                      checked={skillLevel === 'advanced'}
                      onChange={(e) => setSkillLevel(e.target.value)}
                    />
                    <div className="skill-option">
                      <strong>Advanced</strong>
                      <span>I’m an experienced player</span>
                    </div>
                  </label>
                </div>

                <div className="selection-actions">
                  <button onClick={() => setSelectedInstrument(null)} className="btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handleAddInstrument} className="btn-primary" disabled={isAdding}>
                    {isAdding ? 'Adding...' : 'Start Learning'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

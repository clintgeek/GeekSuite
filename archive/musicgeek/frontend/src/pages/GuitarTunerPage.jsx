import { useState, useEffect } from 'react';
import { useInstrument } from '../context/InstrumentContext';
import { Link } from 'react-router-dom';
import Tuner from '../components/Tuner';
import instrumentService from '../services/instrumentService';

// Standard guitar tuning (E A D G B E)
const GUITAR_TUNINGS = {
  standard: {
    name: 'Standard Tuning (E A D G B E)',
    notes: [
      { note: 'E2', frequency: 82.41, string: 6 },
      { note: 'A2', frequency: 110.0, string: 5 },
      { note: 'D3', frequency: 146.83, string: 4 },
      { note: 'G3', frequency: 196.0, string: 3 },
      { note: 'B3', frequency: 246.94, string: 2 },
      { note: 'E4', frequency: 329.63, string: 1 },
    ],
  },
  dropD: {
    name: 'Drop D Tuning (D A D G B E)',
    notes: [
      { note: 'D2', frequency: 73.42, string: 6 },
      { note: 'A2', frequency: 110.0, string: 5 },
      { note: 'D3', frequency: 146.83, string: 4 },
      { note: 'G3', frequency: 196.0, string: 3 },
      { note: 'B3', frequency: 246.94, string: 2 },
      { note: 'E4', frequency: 329.63, string: 1 },
    ],
  },
};

export default function GuitarTunerPage() {
  const { activeInstrument } = useInstrument();
  const [selectedTuning, setSelectedTuning] = useState('standard');
  const [, setDbTunings] = useState([]);

  useEffect(() => {
    loadTunings();
  }, [activeInstrument]);

  const loadTunings = async () => {
    if (activeInstrument?.id) {
      try {
        const tunings = await instrumentService.getTuningConfigurations(activeInstrument.id);
        setDbTunings(tunings);
      } catch (error) {
        console.error('Error loading tunings:', error);
      }
    }
  };

  const currentTuning = GUITAR_TUNINGS[selectedTuning];

  return (
    <div className="tuner-page">
      <div className="container">
        <div className="page-header">
          <h1>Guitar Tuner</h1>
          <p className="page-subtitle">
            Tune your guitar accurately using your device’s microphone
          </p>
        </div>

        <div className="tuning-selector">
          <label htmlFor="tuning-select">Select Tuning:</label>
          <select
            id="tuning-select"
            value={selectedTuning}
            onChange={(e) => setSelectedTuning(e.target.value)}
            className="tuning-select"
          >
            <option value="standard">Standard (E A D G B E)</option>
            <option value="dropD">Drop D (D A D G B E)</option>
          </select>
        </div>

        <Tuner tuningConfig={currentTuning} />

        <div className="tuner-tips">
          <h3>Tuning Tips</h3>
          <div className="tips-grid">
            <div className="tip-card">
              <div className="tip-icon">🎯</div>
              <h4>Start with the Low E</h4>
              <p>
                Begin tuning from the thickest string (6th string) and work your way to the
                thinnest.
              </p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">🔊</div>
              <h4>Play One String</h4>
              <p>Pluck one string at a time clearly. Avoid touching other strings while tuning.</p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">🎸</div>
              <h4>Tune Up, Not Down</h4>
              <p>
                If sharp, go below the target pitch first, then tune up to prevent string slippage.
              </p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">🔄</div>
              <h4>Double Check</h4>
              <p>After tuning all strings, go back and check each string again for accuracy.</p>
            </div>
          </div>
        </div>

        <div className="help-section">
          <div className="help-card">
            <h3>New to tuning?</h3>
            <p>Check out our step-by-step guide on how to properly tune your guitar.</p>
            <Link to="/lessons/how-to-tune-guitar" className="btn-primary">
              View Tuning Tutorial
            </Link>
          </div>
        </div>

        <div className="reference-section">
          <h3>About Guitar Tuning</h3>
          <div className="reference-content">
            <p>
              <strong>Standard tuning (E A D G B E)</strong> is the most common tuning for 6-string
              guitars. From thickest to thinnest string, the notes are:
            </p>
            <ul>
              <li>
                <strong>6th String (E2):</strong> 82.41 Hz - The lowest and thickest string
              </li>
              <li>
                <strong>5th String (A2):</strong> 110.00 Hz
              </li>
              <li>
                <strong>4th String (D3):</strong> 146.83 Hz
              </li>
              <li>
                <strong>3rd String (G3):</strong> 196.00 Hz
              </li>
              <li>
                <strong>2nd String (B3):</strong> 246.94 Hz
              </li>
              <li>
                <strong>1st String (E4):</strong> 329.63 Hz - The highest and thinnest string
              </li>
            </ul>
            <p>
              <strong>Drop D tuning (D A D G B E)</strong> is popular in rock and metal. Only the
              6th string is lowered from E2 to D2 (73.42 Hz), creating a heavier, deeper sound and
              making power chords easier to play.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

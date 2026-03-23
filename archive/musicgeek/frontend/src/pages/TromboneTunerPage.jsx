import { Link } from 'react-router-dom';
import Tuner from '../components/Tuner';

// Trombone tuning - Bb concert pitch
const TROMBONE_TUNING = {
  name: 'Bb Concert Pitch',
  notes: [
    { note: 'Bb2', frequency: 116.54 },
    { note: 'F3', frequency: 174.61 },
    { note: 'Bb3', frequency: 233.08 },
    { note: 'D4', frequency: 293.66 },
    { note: 'F4', frequency: 349.23 },
  ],
};

const SLIDE_POSITIONS = [
  { position: 1, notes: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'], description: 'Closed (1st position)' },
  { position: 2, notes: ['A2', 'E3', 'A3', 'C#4', 'E4'], description: '2nd position' },
  { position: 3, notes: ['Ab2', 'Eb3', 'Ab3', 'C4', 'Eb4'], description: '3rd position' },
  { position: 4, notes: ['G2', 'D3', 'G3', 'B3', 'D4'], description: '4th position' },
  { position: 5, notes: ['Gb2', 'Db3', 'Gb3', 'Bb3', 'Db4'], description: '5th position' },
  { position: 6, notes: ['F2', 'C3', 'F3', 'A3', 'C4'], description: '6th position' },
  { position: 7, notes: ['E2', 'B2', 'E3', 'Ab3', 'B3'], description: '7th position (extended)' },
];

export default function TromboneTunerPage() {
  return (
    <div className="tuner-page">
      <div className="container">
        <div className="page-header">
          <h1>Trombone Tuner</h1>
          <p className="page-subtitle">Tune your trombone to concert Bb pitch</p>
        </div>

        <Tuner tuningConfig={TROMBONE_TUNING} />

        <div className="slide-position-reference">
          <h3>Slide Position Chart</h3>
          <div className="positions-grid">
            {SLIDE_POSITIONS.map((pos) => (
              <div key={pos.position} className="position-card">
                <div className="position-number">{pos.position}</div>
                <div className="position-description">{pos.description}</div>
                <div className="position-notes">{pos.notes.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="tuner-tips">
          <h3>Tuning Tips for Trombone</h3>
          <div className="tips-grid">
            <div className="tip-card">
              <div className="tip-icon">🎺</div>
              <h4>Use Bb Concert Pitch</h4>
              <p>Play a Bb in first position (slide closed) and match it to 116.54 Hz.</p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">🌡️</div>
              <h4>Warm Up First</h4>
              <p>Let your instrument warm up to room temperature for accurate tuning.</p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">💨</div>
              <h4>Consistent Air Stream</h4>
              <p>Use a steady, supported air stream. Inconsistent air affects pitch.</p>
            </div>
            <div className="tip-card">
              <div className="tip-icon">🔧</div>
              <h4>Adjust Tuning Slide</h4>
              <p>If flat, push the slide in. If sharp, pull it out slightly.</p>
            </div>
          </div>
        </div>

        <div className="help-section">
          <div className="help-card">
            <h3>New to trombone tuning?</h3>
            <p>
              Learn the proper technique for tuning your trombone and maintaining good intonation.
            </p>
            <Link to="/lessons/how-to-tune-trombone" className="btn-primary">
              View Tuning Tutorial
            </Link>
          </div>
        </div>

        <div className="reference-section">
          <h3>About Trombone Tuning</h3>
          <div className="reference-content">
            <p>
              The trombone is a <strong>Bb transposing instrument</strong>, meaning when you play a
              C on the trombone, it sounds as a Bb in concert pitch. The standard tuning note is
              <strong>Bb2 at 116.54 Hz</strong> in first position (slide fully closed).
            </p>
            <h4>Tuning Process</h4>
            <ol>
              <li>
                Warm up your instrument and yourself - play long tones to get the instrument singing
              </li>
              <li>
                Play a Bb in first position (slide closed) with a steady, supported air stream
              </li>
              <li>Match the pitch to 116.54 Hz using the tuner above</li>
              <li>
                Adjust the main tuning slide (near the bell) - pull out if sharp, push in if flat
              </li>
              <li>Check the tuning again and make fine adjustments as needed</li>
            </ol>
            <h4>Intonation Tips</h4>
            <p>
              Good intonation on trombone requires more than just tuning. Each note requires slight
              adjustments with the slide and embouchure:
            </p>
            <ul>
              <li>Higher partials tend to be sharp and need careful slide placement</li>
              <li>Lower partials can be flat and may need embouchure support</li>
              <li>Room temperature affects pitch - cold makes you flat, warm makes you sharp</li>
              <li>Use your ear and make small adjustments as you play</li>
            </ul>
          </div>
        </div>

        <div className="harmonic-series">
          <h3>Trombone Harmonic Series</h3>
          <p className="series-description">
            The trombone produces notes from the harmonic series. Here are the fundamental
            frequencies for each position:
          </p>
          <div className="harmonics-grid">
            <div className="harmonic-card">
              <strong>1st Position</strong>
              <div>Bb2: 116.54 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>2nd Position</strong>
              <div>A2: 110.00 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>3rd Position</strong>
              <div>Ab2: 103.83 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>4th Position</strong>
              <div>G2: 98.00 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>5th Position</strong>
              <div>Gb2: 92.50 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>6th Position</strong>
              <div>F2: 87.31 Hz</div>
            </div>
            <div className="harmonic-card">
              <strong>7th Position</strong>
              <div>E2: 82.41 Hz</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

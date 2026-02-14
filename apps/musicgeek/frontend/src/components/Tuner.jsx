import { useState, useEffect, useRef } from 'react';
import { useInstrument } from '../context/InstrumentContext';

// Frequency detection using autocorrelation
class PitchDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.bufferLength = 0;
    this.buffer = null;
  }

  async initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096;
      this.bufferLength = this.analyser.fftSize;
      this.buffer = new Float32Array(this.bufferLength);

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      return true;
    } catch (error) {
      console.error('Error initializing pitch detector:', error);
      return false;
    }
  }

  // Autocorrelation algorithm for pitch detection
  autoCorrelate(buffer, sampleRate) {
    let size = buffer.length;
    let maxSamples = Math.floor(size / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    // Calculate RMS (Root Mean Square) to detect silence
    for (let i = 0; i < size; i++) {
      let val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / size);

    // Not enough signal
    if (rms < 0.01) return -1;

    // Find the best correlation
    let lastCorrelation = 1;
    for (let offset = 1; offset < maxSamples; offset++) {
      let correlation = 0;

      for (let i = 0; i < maxSamples; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
      }

      correlation = 1 - correlation / maxSamples;

      if (correlation > 0.9 && correlation > lastCorrelation) {
        let foundGoodCorrelation = false;

        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
          foundGoodCorrelation = true;
        }

        if (foundGoodCorrelation) {
          // Refine offset using parabolic interpolation
          let shift =
            (buffer[bestOffset + 1] - buffer[bestOffset - 1]) /
            (2 * (2 * buffer[bestOffset] - buffer[bestOffset - 1] - buffer[bestOffset + 1]));
          return sampleRate / (bestOffset + shift);
        }
      }

      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.01) {
      return sampleRate / bestOffset;
    }

    return -1;
  }

  detectPitch() {
    if (!this.analyser) return -1;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const pitch = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

    return pitch;
  }

  cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

// Component
export default function Tuner({ tuningConfig }) {
  const { activeInstrument } = useInstrument();
  const [isListening, setIsListening] = useState(false);
  const [frequency, setFrequency] = useState(null);
  const [closestNote, setClosestNote] = useState(null);
  const [cents, setCents] = useState(0);
  const detectorRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    return () => {
      if (detectorRef.current) {
        detectorRef.current.cleanup();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const startListening = async () => {
    const detector = new PitchDetector();
    const initialized = await detector.initialize();

    if (!initialized) {
      alert('Could not access microphone. Please check your permissions.');
      return;
    }

    detectorRef.current = detector;
    setIsListening(true);

    const updatePitch = () => {
      const pitch = detector.detectPitch();

      if (pitch > 0) {
        setFrequency(pitch);

        // Find closest note from tuning configuration
        if (tuningConfig && tuningConfig.notes) {
          let minDiff = Infinity;
          let closest = null;

          tuningConfig.notes.forEach((note) => {
            const diff = Math.abs(note.frequency - pitch);
            if (diff < minDiff) {
              minDiff = diff;
              closest = note;
            }
          });

          if (closest) {
            // Calculate cents (1 semitone = 100 cents)
            const centsOff = 1200 * Math.log2(pitch / closest.frequency);
            setClosestNote(closest);
            setCents(Math.round(centsOff));
          }
        }
      }

      animationRef.current = requestAnimationFrame(updatePitch);
    };

    updatePitch();
  };

  const stopListening = () => {
    if (detectorRef.current) {
      detectorRef.current.cleanup();
      detectorRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsListening(false);
    setFrequency(null);
    setClosestNote(null);
    setCents(0);
  };

  const getTuningStatus = () => {
    if (!cents) return 'idle';
    if (Math.abs(cents) <= 5) return 'in-tune';
    if (cents > 0) return 'sharp';
    return 'flat';
  };

  const tuningStatus = getTuningStatus();

  return (
    <div className="tuner">
      <div className="tuner-header">
        <h2>{activeInstrument?.name} Tuner</h2>
        {tuningConfig && <p className="tuning-name">{tuningConfig.name}</p>}
      </div>

      <div className="tuner-display">
        {!isListening ? (
          <div className="tuner-idle">
            <div className="tuner-icon">🎵</div>
            <p>Click “Start Tuning” to begin</p>
          </div>
        ) : (
          <>
            {closestNote ? (
              <>
                <div className={`note-display ${tuningStatus}`}>
                  <div className="note-name">{closestNote.note}</div>
                  {closestNote.string && (
                    <div className="string-info">String {closestNote.string}</div>
                  )}
                </div>

                <div className="frequency-display">
                  <div className="detected-frequency">{frequency?.toFixed(1)} Hz</div>
                  <div className="target-frequency">Target: {closestNote.frequency} Hz</div>
                </div>

                <div className="cents-meter">
                  <div className="cents-scale">
                    <span className="scale-mark">-50</span>
                    <span className="scale-mark">0</span>
                    <span className="scale-mark">+50</span>
                  </div>
                  <div className="cents-bar">
                    <div
                      className={`cents-indicator ${tuningStatus}`}
                      style={{
                        left: `${50 + (cents / 50) * 50}%`,
                      }}
                    />
                  </div>
                  <div className="cents-value">
                    {cents > 0 ? '+' : ''}
                    {cents} cents
                  </div>
                </div>

                <div className={`tuning-status ${tuningStatus}`}>
                  {tuningStatus === 'in-tune' && '✓ In Tune'}
                  {tuningStatus === 'sharp' && '↑ Too Sharp'}
                  {tuningStatus === 'flat' && '↓ Too Flat'}
                </div>
              </>
            ) : (
              <div className="tuner-listening">
                <div className="listening-indicator">
                  <div className="pulse"></div>
                  <div className="pulse"></div>
                  <div className="pulse"></div>
                </div>
                <p>Listening for sound...</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="tuner-controls">
        {!isListening ? (
          <button className="btn-primary btn-large" onClick={startListening}>
            Start Tuning
          </button>
        ) : (
          <button className="btn-secondary btn-large" onClick={stopListening}>
            Stop Tuning
          </button>
        )}
      </div>

      {tuningConfig?.notes && (
        <div className="reference-notes">
          <h3>Reference Notes</h3>
          <div className="notes-grid">
            {tuningConfig.notes.map((note, index) => (
              <div key={index} className="reference-note">
                <div className="reference-note-name">{note.note}</div>
                {note.string && <div className="reference-string">String {note.string}</div>}
                <div className="reference-frequency">{note.frequency} Hz</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

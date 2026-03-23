/**
 * Chord Detection using Web Audio API
 * Analyzes microphone input to detect guitar chords
 */

class ChordDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.isListening = false;

    // Note frequencies (Hz) for standard guitar tuning
    this.noteFrequencies = {
      E2: 82.41, // Low E
      A2: 110.0, // A
      D3: 146.83, // D
      G3: 196.0, // G
      B3: 246.94, // B
      E4: 329.63, // High E
      // Additional notes for fretted positions
      F2: 87.31,
      'F#2': 92.5,
      G2: 98.0,
      'G#2': 103.83,
      'A#2': 116.54,
      C3: 130.81,
      'C#3': 138.59,
      'D#3': 155.56,
      F3: 174.61,
      'F#3': 185.0,
      'G#3': 207.65,
      A3: 220.0,
      'A#3': 233.08,
      C4: 261.63,
      'C#4': 277.18,
      D4: 293.66,
      'D#4': 311.13,
      F4: 349.23,
      'F#4': 369.99,
      G4: 392.0,
      'G#4': 415.3,
      A4: 440.0,
    };

    // Chord definitions - which notes should be present
    this.chordDefinitions = {
      A: ['A2', 'E3', 'A3', 'C#4', 'E4'], // A major
      Am: ['A2', 'E3', 'A3', 'C4', 'E4'], // A minor
      D: ['D3', 'A3', 'D4', 'F#4'], // D major
      Dm: ['D3', 'A3', 'D4', 'F4'], // D minor
      E: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], // E major
      Em: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'], // E minor
      C: ['C3', 'E3', 'G3', 'C4', 'E4'], // C major
      G: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'], // G major
      F: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'], // F major
      D7: ['D3', 'A3', 'C4', 'F#4'], // D7 (D, F#, A, C)
      A7: ['A2', 'E3', 'G3', 'C#4', 'E4'], // A7 (A, C#, E, G)
    };
  }

  async start() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096; // Higher for better frequency resolution
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      this.isListening = true;
      return { success: true };
    } catch (error) {
      console.error('Microphone access error:', error);
      return {
        success: false,
        error: error.message || 'Microphone access denied',
      };
    }
  }

  stop() {
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isListening = false;
  }

  // Autocorrelation pitch detection (more accurate for guitar)
  detectPitch(buffer) {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    // Calculate RMS (root mean square) for volume detection
    for (let i = 0; i < SIZE; i++) {
      const val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    // Not enough signal
    if (rms < 0.01) return -1;

    // Autocorrelation
    let lastCorrelation = 1;
    for (let offset = 0; offset < MAX_SAMPLES; offset++) {
      let correlation = 0;

      for (let i = 0; i < MAX_SAMPLES; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
      }

      correlation = 1 - correlation / MAX_SAMPLES;

      if (correlation > 0.9 && correlation > lastCorrelation) {
        const foundGoodCorrelation = correlation > bestCorrelation;
        if (foundGoodCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      }

      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.01) {
      const fundamentalFreq = this.audioContext.sampleRate / bestOffset;
      return fundamentalFreq;
    }

    return -1;
  }

  // Find closest note to a frequency
  frequencyToNote(frequency) {
    if (frequency < 0) return null;

    let closestNote = null;
    let minDiff = Infinity;

    for (const [note, freq] of Object.entries(this.noteFrequencies)) {
      const diff = Math.abs(frequency - freq);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = note;
      }
    }

    // Only return if within 5% of the target frequency (in tune)
    const targetFreq = this.noteFrequencies[closestNote];
    if (Math.abs(frequency - targetFreq) / targetFreq < 0.05) {
      return closestNote;
    }

    return null;
  }

  // Detect currently playing chord
  async detectChord() {
    if (!this.isListening || !this.analyser) {
      return {
        success: false,
        error: 'Not listening',
      };
    }

    const bufferLength = this.analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(buffer);

    // Detect fundamental pitch
    const frequency = this.detectPitch(buffer);
    const detectedNote = this.frequencyToNote(frequency);

    // Get frequency spectrum for overtone detection
    const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(frequencyData);

    // Find peaks in frequency spectrum (multiple notes)
    const peaks = this.findPeaks(frequencyData);
    const detectedNotes = peaks
      .map((freq) => this.frequencyToNote(freq))
      .filter((note) => note !== null);

    // Match detected notes to chord definitions
    const matchedChord = this.matchChord(detectedNotes);

    return {
      success: true,
      chord: matchedChord,
      notes: detectedNotes,
      fundamentalNote: detectedNote,
      frequency: frequency,
      confidence: matchedChord ? this.calculateConfidence(detectedNotes, matchedChord) : 0,
    };
  }

  // Find frequency peaks in spectrum
  findPeaks(frequencyData) {
    const peaks = [];
    const minPeakHeight = 100; // Minimum amplitude threshold
    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;

    for (let i = 1; i < frequencyData.length - 1; i++) {
      // Check if this is a local maximum
      if (
        frequencyData[i] > frequencyData[i - 1] &&
        frequencyData[i] > frequencyData[i + 1] &&
        frequencyData[i] > minPeakHeight
      ) {
        // Convert bin to frequency
        const frequency = (i * nyquist) / frequencyData.length;

        // Only include guitar range (80Hz - 1200Hz)
        if (frequency >= 80 && frequency <= 1200) {
          peaks.push(frequency);
        }
      }
    }

    return peaks;
  }

  // Match detected notes to known chords
  matchChord(detectedNotes) {
    if (detectedNotes.length < 2) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const [chordName, chordNotes] of Object.entries(this.chordDefinitions)) {
      let matchCount = 0;

      for (const detectedNote of detectedNotes) {
        // Check if this note is in the chord (allowing octave variations)
        const noteRoot = detectedNote.replace(/[0-9]/g, '');
        const chordHasNote = chordNotes.some((cn) => cn.startsWith(noteRoot));

        if (chordHasNote) {
          matchCount++;
        }
      }

      const score = matchCount / chordNotes.length;

      if (score > bestScore && score > 0.4) {
        // At least 40% match
        bestScore = score;
        bestMatch = chordName;
      }
    }

    return bestMatch;
  }

  calculateConfidence(detectedNotes, chordName) {
    const chordNotes = this.chordDefinitions[chordName];
    if (!chordNotes) return 0;

    let matchCount = 0;
    for (const detectedNote of detectedNotes) {
      const noteRoot = detectedNote.replace(/[0-9]/g, '');
      if (chordNotes.some((cn) => cn.startsWith(noteRoot))) {
        matchCount++;
      }
    }

    return Math.min(matchCount / chordNotes.length, 1.0);
  }

  // Continuous listening with callback
  startContinuousDetection(callback, intervalMs = 500) {
    if (!this.isListening) {
      throw new Error('Must call start() first');
    }

    const detectInterval = setInterval(async () => {
      if (!this.isListening) {
        clearInterval(detectInterval);
        return;
      }

      const result = await this.detectChord();
      callback(result);
    }, intervalMs);

    return detectInterval;
  }
}

export default ChordDetector;

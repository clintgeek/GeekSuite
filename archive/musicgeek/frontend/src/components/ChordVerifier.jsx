import { useState, useEffect, useRef } from 'react';
import ChordDetector from '../utils/chordDetection';

const ChordVerifier = ({ expectedChord, onVerified }) => {
  const [isListening, setIsListening] = useState(false);
  const [detectedChord, setDetectedChord] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, listening, detected, verified

  const detectorRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (detectorRef.current) {
        detectorRef.current.stop();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startListening = async () => {
    try {
      setError(null);
      setStatus('listening');

      // Create detector if it doesn't exist
      if (!detectorRef.current) {
        detectorRef.current = new ChordDetector();
      }

      // Start microphone
      const result = await detectorRef.current.start();

      if (!result.success) {
        setError(result.error);
        setStatus('idle');
        return;
      }

      setIsListening(true);

      // Start continuous detection
      intervalRef.current = detectorRef.current.startContinuousDetection((result) => {
        if (result.success && result.chord) {
          setDetectedChord(result.chord);
          setConfidence(result.confidence);

          // Normalize chord names for comparison (e.g., "Am" vs "A minor")
          const normalizedDetected = normalizeChordName(result.chord);
          const normalizedExpected = normalizeChordName(expectedChord);

          if (normalizedDetected === normalizedExpected && result.confidence > 0.6) {
            setStatus('verified');
            if (onVerified) {
              onVerified(result.chord);
            }
            // Auto-stop after verification
            setTimeout(() => {
              stopListening();
            }, 2000);
          } else if (result.chord) {
            setStatus('detected');
          }
        }
      }, 300); // Check every 300ms
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  };

  const stopListening = () => {
    if (detectorRef.current) {
      detectorRef.current.stop();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsListening(false);
    setStatus('idle');
    setDetectedChord(null);
    setConfidence(0);
  };

  const normalizeChordName = (chord) => {
    if (!chord) return '';
    // Convert "A minor" to "Am", "A major" to "A", etc.
    return chord
      .replace(' minor', 'm')
      .replace(' major', '')
      .replace(' Major', '')
      .replace(' Minor', 'm')
      .trim();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'listening':
        return 'bg-blue-500';
      case 'detected':
        return detectedChord === normalizeChordName(expectedChord)
          ? 'bg-green-500'
          : 'bg-yellow-500';
      case 'verified':
        return 'bg-green-600';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'listening':
        return 'Listening...';
      case 'detected':
        if (normalizeChordName(detectedChord) === normalizeChordName(expectedChord)) {
          return '✓ Correct chord detected!';
        }
        return `Detected: ${detectedChord}`;
      case 'verified':
        return '✓ Verified!';
      default:
        return 'Ready to verify';
    }
  };

  return (
    <div className="chord-verifier bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">🎸 Chord Verifier</h3>
        <div className="text-sm text-gray-600">
          Expected: <span className="font-bold text-blue-600">{expectedChord}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-3 text-sm">
          <strong>Error:</strong> {error}
          <div className="text-xs mt-1">
            Please allow microphone access in your browser settings.
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        {!isListening ? (
          <button
            onClick={startListening}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            Start Verification
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
            Stop
          </button>
        )}
      </div>

      {isListening && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`}></div>
            <span className="text-sm font-medium text-gray-700">{getStatusText()}</span>
          </div>

          {detectedChord && (
            <div className="bg-white border border-gray-200 rounded p-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Detected Chord</div>
                  <div className="text-2xl font-bold text-gray-800">{detectedChord}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase">Confidence</div>
                  <div className="text-lg font-semibold text-blue-600">
                    {Math.round(confidence * 100)}%
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      confidence > 0.6 ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${confidence * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 italic">
            💡 Tip: Play the chord clearly and let it ring for best results
          </div>
        </div>
      )}

      {status === 'verified' && (
        <div className="mt-3 bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded text-sm font-medium">
          ✓ Great job! You played the chord correctly!
        </div>
      )}
    </div>
  );
};

export default ChordVerifier;

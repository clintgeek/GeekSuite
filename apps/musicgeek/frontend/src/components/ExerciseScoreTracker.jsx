import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import './ExerciseScoreTracker.css';

const ExerciseScoreTracker = ({
  lessonId,
  exerciseType,
  metricName,
  duration = 60,
  onComplete,
}) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [count, setCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const hasLoadedStats = useRef(false);

  // Load historical stats when component mounts
  useEffect(() => {
    if (!hasLoadedStats.current) {
      loadStats();
      hasLoadedStats.current = true;
    }
  }, []);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  const loadStats = async () => {
    try {
      const response = await api.get(
        `/progress/exercise/${exerciseType}?lesson_id=${lessonId}&limit=5`
      );
      setStats(response.data.stats);
    } catch (err) {
      console.error('Failed to load exercise history:', err);
      // Don't show error to user - stats are optional
    }
  };

  const handleStart = () => {
    setIsRunning(true);
    setCount(0);
    setTimeLeft(duration);
    setIsComplete(false);
    setError(null);
  };

  const handleIncrement = () => {
    if (isRunning && !isComplete) {
      setCount((prev) => prev + 1);
    }
  };

  const handleTimerComplete = () => {
    setIsRunning(false);
    setIsComplete(true);
    saveProgress(count);
  };

  const saveProgress = async (finalCount) => {
    setLoading(true);
    try {
      await api.post(
        '/progress/exercise',
        {
          lesson_id: lessonId,
          exercise_type: exerciseType,
          metric_name: metricName,
          metric_value: finalCount,
          notes: `Completed ${finalCount} changes in ${duration} seconds`,
        }
      );

      // Reload stats to get updated personal best
      await loadStats();

      if (onComplete) {
        onComplete(finalCount);
      }
    } catch (err) {
      console.error('Failed to save exercise progress:', err);
      setError('Failed to save your score. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return ((duration - timeLeft) / duration) * 100;
  };

  const isPersonalBest = stats && count > (stats.personal_best || 0);

  return (
    <div className="exercise-score-tracker">
      {!isRunning && !isComplete && (
        <div className="tracker-start">
          <h3>One-Minute Change Drill</h3>
          <p>
            Click the button below each time you complete a clean chord change. Try to beat your
            personal best!
          </p>

          {stats && stats.personal_best && (
            <div className="stats-preview">
              <div className="stat-item">
                <span className="stat-label">Personal Best</span>
                <span className="stat-value">{stats.personal_best}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Average</span>
                <span className="stat-value">
                  {parseFloat(stats.average_score || 0).toFixed(1)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Attempts</span>
                <span className="stat-value">{stats.total_attempts}</span>
              </div>
            </div>
          )}

          <button className="btn-start" onClick={handleStart}>
            Start Timer
          </button>
        </div>
      )}

      {isRunning && !isComplete && (
        <div className="tracker-active">
          <div className="timer-display">
            <div className="time-remaining">{formatTime(timeLeft)}</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${getProgressPercentage()}%` }} />
            </div>
          </div>

          <div className="counter-display">
            <div className="count-label">Changes</div>
            <div className="count-value">{count}</div>
          </div>

          <button className="btn-change" onClick={handleIncrement}>
            Change!
          </button>
        </div>
      )}

      {isComplete && (
        <div className="tracker-complete">
          <h3>Great Work! 🎉</h3>
          <div className="final-score">
            <span className="score-label">You made</span>
            <span className="score-value">{count}</span>
            <span className="score-label">changes!</span>
          </div>

          {isPersonalBest && <div className="personal-best-badge">🏆 New Personal Best!</div>}

          {stats && (
            <div className="stats-summary">
              <div className="stat-comparison">
                <span className="stat-label">Personal Best:</span>
                <span className="stat-value">{stats.personal_best}</span>
              </div>
              <div className="stat-comparison">
                <span className="stat-label">Your Average:</span>
                <span className="stat-value">
                  {parseFloat(stats.average_score || 0).toFixed(1)}
                </span>
              </div>
              <div className="stat-comparison">
                <span className="stat-label">Total Attempts:</span>
                <span className="stat-value">{stats.total_attempts}</span>
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {loading && <div className="loading-message">Saving your score...</div>}

          <div className="complete-actions">
            <button className="btn-retry" onClick={handleStart}>
              Try Again
            </button>
            {onComplete && (
              <button className="btn-continue" onClick={() => onComplete(count)}>
                Continue Lesson
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseScoreTracker;

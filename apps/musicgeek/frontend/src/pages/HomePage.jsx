import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, useUserMode } from '../context/AuthContext';
import { useUserProgress } from '../context/UserProgressContext';
import { useInstrument } from '../context/InstrumentContext';
import { getAllLessons } from '../services/lessonService';
import LessonCard from '../components/LessonCard';

export default function HomePage() {
  const { isAuthenticated, currentUser } = useAuth();
  const uiMode = useUserMode();
  const { totalXP, level, progress, completedLessons, totalPracticeTime } = useUserProgress();
  const { activeInstrument } = useInstrument();

  const [nextLesson, setNextLesson] = useState(null);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [nextError, setNextError] = useState(null);

  // Load a "continue" lesson similar to LessonsPage, scoped to the active instrument
  useEffect(() => {
    const loadNextLesson = async () => {
      if (!isAuthenticated || !activeInstrument) {
        setNextLesson(null);
        return;
      }

      try {
        setIsLoadingNext(true);
        setNextError(null);

        const lessons = await getAllLessons({ instrumentId: activeInstrument.id });

        const filtered =
          uiMode === 'kid'
            ? lessons.filter((lesson) => {
                const tags = lesson.tags || [];
                return Array.isArray(tags) && (tags.includes('kid') || tags.includes('session'));
              })
            : lessons;

        const withProgress = filtered.map((lesson) => {
          const completed =
            (lesson.progress && lesson.progress.completed) ??
            lesson.completed ??
            lesson.is_completed ??
            false;
          const currentStep =
            (lesson.progress && lesson.progress.currentStep) ?? lesson.current_step ?? null;
          return {
            ...lesson,
            __completed: completed,
            __currentStep: currentStep,
          };
        });

        const continueCandidate =
          withProgress.find((l) => !l.__completed && l.__currentStep) ||
          withProgress.find((l) => !l.__completed) ||
          withProgress[0] ||
          null;

        setNextLesson(continueCandidate);
      } catch (err) {
        setNextError(err.message || 'Failed to load next lesson');
      } finally {
        setIsLoadingNext(false);
      }
    };

    loadNextLesson();
  }, [isAuthenticated, activeInstrument, uiMode]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated users see a dashboard-style home
  const displayName = currentUser?.display_name || currentUser?.username || 'Musician';
  const currentInstrumentName = activeInstrument?.display_name || activeInstrument?.name;
  const achievementsCount = progress?.achievements?.length || 0;
  const streak = progress?.current_streak || 0;
  const bestStreak = progress?.longest_streak || 0;

  return (
    <div className="dashboard-page">
      <div className="container">
        <header className="dashboard-header">
          <h1>Welcome back, {displayName}</h1>
          <p>
            Level {level} · {totalXP} XP
            {currentInstrumentName ? ` · Active instrument: ${currentInstrumentName}` : ''}
          </p>
        </header>

        <section className="dashboard-stats">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-value">{totalXP}</div>
              <div className="stat-label">Total XP</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🎚️</div>
              <div className="stat-value">{level}</div>
              <div className="stat-label">Level</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">📚</div>
              <div className="stat-value">{completedLessons}</div>
              <div className="stat-label">Lessons Completed</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">⏱️</div>
              <div className="stat-value">{Math.round((totalPracticeTime || 0) / 60)}</div>
              <div className="stat-label">Hours Practiced</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🔥</div>
              <div className="stat-value">{streak} days</div>
              <div className="stat-label">Current Streak (Best: {bestStreak} days)</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-value">{achievementsCount}</div>
              <div className="stat-label">Achievements</div>
            </div>
          </div>
        </section>

        <section className="dashboard-main">
          <div className="dashboard-main-left">
            <h2 className="dashboard-section-title">Continue practice</h2>
            {isLoadingNext && <p>Loading your next lesson...</p>}
            {nextError && <p className="error-message">{nextError}</p>}
            {!isLoadingNext && !nextError && nextLesson && (
              <div className="dashboard-continue-card">
                <LessonCard lesson={nextLesson} />
              </div>
            )}
            {!isLoadingNext && !nextError && !nextLesson && (
              <p>
                No lessons found yet for your active instrument.{' '}
                <Link to="/lessons">Browse lessons</Link> to get started.
              </p>
            )}
          </div>

          <div className="dashboard-main-right">
            <h2 className="dashboard-section-title">Quick actions</h2>
            <div className="dashboard-actions-grid">
              <Link to="/lessons" className="dashboard-action-card">
                <div className="dashboard-action-icon">🎧</div>
                <div className="dashboard-action-body">
                  <h3>Jump to Lessons</h3>
                  <p>Pick a new lesson or revisit something you love.</p>
                </div>
              </Link>

              <Link to="/instruments" className="dashboard-action-card">
                <div className="dashboard-action-icon">🎸</div>
                <div className="dashboard-action-body">
                  <h3>Switch Instrument</h3>
                  <p>Choose which instrument you want to focus on today.</p>
                </div>
              </Link>

              <Link to="/metronome" className="dashboard-action-card">
                <div className="dashboard-action-icon">⏱️</div>
                <div className="dashboard-action-body">
                  <h3>Open Metronome</h3>
                  <p>Lock in your timing before a practice session.</p>
                </div>
              </Link>

              <Link to="/profile" className="dashboard-action-card">
                <div className="dashboard-action-icon">👤</div>
                <div className="dashboard-action-body">
                  <h3>View Profile</h3>
                  <p>See detailed stats, achievements, and recent practice.</p>
                </div>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';

export default function LessonCard({ lesson }) {
  const difficultyColors = {
    beginner: '#4CAF50',
    intermediate: '#FF9800',
    advanced: '#F44336',
  };

  const categoryIcons = {
    fundamentals: '🎸',
    chords: '🎵',
    scales: '🎼',
    techniques: '⚡',
    songs: '🎶',
    theory: '📖',
  };

  const estimatedMinutes =
    lesson.estimatedTimeMinutes ?? lesson.estimated_duration ?? lesson.estimated_time_minutes;
  const xp = lesson.xpReward ?? lesson.xp_reward ?? 0;
  const completed =
    (lesson.progress && lesson.progress.completed) ??
    lesson.completed ??
    lesson.is_completed ??
    false;
  const inProgress =
    !completed && ((lesson.progress && lesson.progress.currentStep) || lesson.current_step);

  return (
    <Link to={`/lessons/${lesson.id}`} className="lesson-card">
      <div className="lesson-card-header">
        <span className="lesson-icon">{categoryIcons[lesson.category] || '🎸'}</span>
        <span
          className="lesson-difficulty"
          style={{ backgroundColor: difficultyColors[lesson.difficulty] }}
        >
          {lesson.difficulty}
        </span>
      </div>

      <div className="lesson-card-body">
        <h3 className="lesson-title">{lesson.title}</h3>
        <p className="lesson-description">{lesson.description}</p>

        <div className="lesson-meta">
          <span className="lesson-duration">
            ⏱️ {estimatedMinutes != null ? `${estimatedMinutes} min` : '—'}
          </span>
          <span className="lesson-xp">⭐ {xp} XP</span>
        </div>

        {completed && (
          <div className="lesson-completed">
            <span className="completed-badge">✓ Completed</span>
          </div>
        )}
        {!completed && inProgress && (
          <div className="lesson-completed">
            <span className="completed-badge">In progress</span>
          </div>
        )}
      </div>
    </Link>
  );
}

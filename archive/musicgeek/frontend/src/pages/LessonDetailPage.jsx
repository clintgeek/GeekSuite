import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLessonById, startLesson, updateLessonProgress } from '../services/lessonService';
import { useUserMode } from '../context/AuthContext';
import LessonRunner from '../components/LessonRunner';
import LoadingSpinner from '../components/LoadingSpinner';

export default function LessonDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const uiMode = useUserMode();
  const [lesson, setLesson] = useState(null);
  const [initialStepIndex, setInitialStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLesson();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLesson = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const lessonData = await getLessonById(id);
      setLesson(lessonData);

      const initialIndex = lessonData.current_step ? Math.max(lessonData.current_step - 1, 0) : 0;
      setInitialStepIndex(initialIndex);

      // Auto-start lesson if not started
      if (!lessonData.started_at) {
        // Auto-start lesson if not started
        await startLesson(id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    // Overview is now read-only for completion;
    // use the guided practice session to actually complete lessons.
    navigate('/lessons');
  };

  if (isLoading) {
    return (
      <div className="lesson-detail-page">
        <div className="container">
          <LoadingSpinner message="Loading lesson details..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lesson-detail-page">
        <div className="container">
          <div className="error-message">{error}</div>
          <button onClick={() => navigate('/lessons')} className="btn-secondary">
            Back to Lessons
          </button>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="lesson-detail-page">
        <div className="container">
          <p>Lesson not found</p>
          <button onClick={() => navigate('/lessons')} className="btn-secondary">
            Back to Lessons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-detail-page">
      <div className="container">
        <button onClick={() => navigate('/lessons')} className="back-button">
          ← Back to Lessons
        </button>

        <div className="lesson-header">
          <div className="lesson-header-content">
            <h1>{lesson.title}</h1>
            <p className="lesson-description">{lesson.description}</p>

            <div className="lesson-info">
              <span className="info-item">
                <strong>Category:</strong> {lesson.category}
              </span>
              <span className="info-item">
                <strong>Difficulty:</strong> {lesson.difficulty}
              </span>
              <span className="info-item">
                <strong>Duration:</strong> {lesson.estimated_time_minutes} minutes
              </span>
            </div>

            <div className="lesson-actions" style={{ marginTop: '1rem' }}>
              <button
                onClick={() => navigate(`/practice/session/${id}`)}
                className="btn-primary"
                type="button"
              >
                {uiMode === 'kid' ? 'Start Guided Practice' : 'Start Practice Session'}
              </button>
              <p className="lesson-actions-hint">
                Use guided practice to track progress and mark this lesson complete.
              </p>
            </div>

            {lesson.completed && (
              <div className="completed-status">✓ You’ve completed this lesson!</div>
            )}

            {/* Video embed if available */}
            {lesson.video_url &&
              (() => {
                const url = lesson.video_url;
                let embedUrl = url;
                let watchUrl = url;

                if (url.includes('youtube.com/watch')) {
                  const videoId = new URL(url).searchParams.get('v');
                  if (videoId) {
                    embedUrl = `https://www.youtube.com/embed/${videoId}`;
                    watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
                  }
                }

                return (
                  <div className="lesson-video">
                    <iframe
                      width="100%"
                      height="400"
                      src={embedUrl}
                      title={lesson.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    <p className="lesson-video-link">
                      <a href={watchUrl} target="_blank" rel="noreferrer">
                        Open on YouTube
                      </a>
                    </p>
                  </div>
                );
              })()}
          </div>
        </div>

        {/* Render template-based lessons or fall back to legacy LessonRunner */}
        {lesson.template && lesson.content ? (
          <div className="lesson-content-preview">
            <h2>Lesson Preview</h2>
            <p>Click &quot;Start Practice Session&quot; above to begin the guided lesson.</p>
            {lesson.content.steps && lesson.content.steps.length > 0 && (
              <div className="steps-preview">
                <h3>What you&apos;ll learn:</h3>
                <ol>
                  {lesson.content.steps.map((step, idx) => (
                    <li key={step.id || idx}>
                      <strong>{step.title}</strong>
                      {step.body && (
                        <p>
                          {step.body.substring(0, 100)}
                          {step.body.length > 100 ? '...' : ''}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <LessonRunner
            lesson={lesson}
            uiMode={uiMode}
            initialStepIndex={initialStepIndex}
            onProgressChange={(nextStep) => updateLessonProgress(id, nextStep)}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
}

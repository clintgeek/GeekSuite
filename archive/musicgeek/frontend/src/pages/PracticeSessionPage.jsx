import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getLessonById,
  startLesson,
  updateLessonProgress,
  completeLesson,
} from '../services/lessonService';
import { useUserProgress } from '../context/UserProgressContext';
import { useUserMode } from '../context/AuthContext';
import LessonRunner from '../components/LessonRunner';
import LessonTemplateRenderer from '../lessonTemplates/LessonTemplateRenderer';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PracticeSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshProgress } = useUserProgress();
  const uiMode = useUserMode();

  const [lesson, setLesson] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialStepIndex, setInitialStepIndex] = useState(0);

  useEffect(() => {
    loadLesson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadLesson = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const lessonData = await getLessonById(id, true); // Force cache bust
      console.log('🔍 Loaded lesson data:', {
        id: lessonData.id,
        slug: lessonData.slug,
        template: lessonData.template,
        hasContent: !!lessonData.content,
        contentStepsCount: lessonData.content?.steps?.length || 0,
        legacyStepsCount: lessonData.steps?.length || 0,
        step5: lessonData.content?.steps?.[4],
      });
      setLesson(lessonData);

      const initialIndex = lessonData.current_step ? Math.max(lessonData.current_step - 1, 0) : 0;
      setInitialStepIndex(initialIndex);

      if (!lessonData.started_at) {
        await startLesson(id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load practice session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!lesson) return;

    try {
      await completeLesson(id);
      await refreshProgress();
      navigate('/lessons');
    } catch (err) {
      console.error('Failed to complete practice session:', err);
      setError(err.message || 'Failed to complete practice session');
    }
  };

  if (isLoading) {
    return (
      <div className="lesson-detail-page">
        <div className="container">
          <LoadingSpinner message="Preparing your practice session..." />
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

  if (!lesson || (!lesson.template && (!lesson.steps || lesson.steps.length === 0))) {
    return (
      <div className="lesson-detail-page">
        <div className="container">
          <p>No steps available for this practice session.</p>
          <button onClick={() => navigate('/lessons')} className="btn-secondary">
            Back to Lessons
          </button>
        </div>
      </div>
    );
  }

  const templateStepsCount = Array.isArray(lesson?.content?.steps)
    ? lesson.content.steps.length
    : 0;
  const stepsCount = templateStepsCount || (lesson?.steps ? lesson.steps.length : 0);

  return (
    <div className="lesson-detail-page">
      <div className="container">
        <button onClick={() => navigate('/lessons')} className="back-button">
          ← Back to Lessons
        </button>

        <div className="lesson-header">
          <div className="lesson-header-content">
            <h1>{lesson.title}</h1>
            <p className="lesson-description">Guided practice session</p>
            <div className="lesson-info">
              <span className="info-item">
                <strong>Steps:</strong> {stepsCount}
              </span>
              {lesson.estimated_time_minutes && (
                <span className="info-item">
                  <strong>Approx. Duration:</strong> {lesson.estimated_time_minutes} minutes
                </span>
              )}
            </div>
          </div>
        </div>

        {lesson.template ? (
          <LessonTemplateRenderer
            lesson={lesson}
            uiMode={uiMode}
            initialStepIndex={initialStepIndex}
            onProgressChange={(nextStep) => updateLessonProgress(id, nextStep)}
            onComplete={handleComplete}
          />
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

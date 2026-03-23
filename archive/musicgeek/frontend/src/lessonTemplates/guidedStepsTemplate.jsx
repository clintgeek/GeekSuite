import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';

function buildCoachMessage(stepNumber, totalSteps, uiMode) {
  const isKidMode = uiMode === 'kid';

  if (totalSteps <= 1) {
    return isKidMode
      ? "🎸 Let's explore your guitar together!"
      : 'A focused intro to get you comfortable with your instrument.';
  }

  if (stepNumber === 1) {
    return isKidMode
      ? "🌟 Awesome! You just started your guitar journey. Let's make this fun!"
      : 'Strong start. Focus on understanding each concept fully.';
  }

  if (stepNumber === totalSteps) {
    return isKidMode
      ? "🎯 Last step! You're about to unlock your next guitar adventure!"
      : 'Final step. Complete this to move on to the next lesson.';
  }

  const halfway = Math.ceil(totalSteps / 2);
  if (stepNumber === halfway) {
    return isKidMode
      ? "🔥 You're halfway there! Take a breath and keep rocking!"
      : 'Halfway through. Stay relaxed and focus on the details.';
  }

  return isKidMode
    ? "💪 You're doing amazing! Take your time and enjoy each step."
    : 'Steady progress. Go slowly and pay attention to technique.';
}

export default function GuidedStepsTemplate({
  lesson,
  uiMode,
  initialStepIndex = 0,
  onProgressChange,
  onComplete,
}) {
  const steps = useMemo(() => {
    if (!lesson) return [];

    const contentSteps = Array.isArray(lesson.content?.steps) ? lesson.content.steps : null;
    if (contentSteps && contentSteps.length) {
      return contentSteps.map((step, idx) => ({
        ...step,
        _stepNumber: step.stepNumber ?? step.step_number ?? idx + 1,
      }));
    }

    const legacySteps = Array.isArray(lesson.steps) ? lesson.steps : [];
    return legacySteps.map((step, idx) => ({
      id: step.id || step._id || idx,
      title: step.title || step.instruction,
      body: step.body || step.instruction,
      imageUrl: step.imageUrl || step.visualAssetUrl || step.visual_asset_url,
      type: step.step_type || step.stepType || 'text',
      _stepNumber: step.step_number ?? step.stepNumber ?? step.index ?? step.orderIndex ?? idx + 1,
    }));
  }, [lesson]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!steps.length) return 0;
    const clamped = Math.min(Math.max(initialStepIndex || 0, 0), steps.length - 1);
    return clamped;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!steps.length) {
      setCurrentIndex(0);
      return;
    }

    const clamped = Math.min(Math.max(initialStepIndex || 0, 0), steps.length - 1);
    setCurrentIndex(clamped);
  }, [initialStepIndex, steps.length]);

  useEffect(() => {
    if (!steps.length || !onProgressChange) return;

    const currentStep = steps[currentIndex];
    const stepNumber = currentStep?._stepNumber ?? currentIndex + 1;
    onProgressChange(stepNumber);
  }, [currentIndex, steps, onProgressChange]);

  if (!lesson) {
    return null;
  }

  if (!steps.length) {
    return (
      <div className="guided-lesson">
        <div className="guided-lesson__empty">
          <p>No steps are defined for this lesson yet.</p>
        </div>
      </div>
    );
  }

  const step = steps[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;
  const stepNumber = step._stepNumber ?? currentIndex + 1;
  const progress = Math.max(0, Math.min(100, Math.round((stepNumber / steps.length) * 100)));

  const coachMessage = buildCoachMessage(stepNumber, steps.length, uiMode);

  const handlePrev = () => {
    if (isFirst) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((idx) => Math.max(idx - 1, 0));
      setIsTransitioning(false);
    }, 300);
  };

  const handleNext = () => {
    if (isLast) {
      // Celebration for completing the lesson!
      setShowSuccess(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4CAF50', '#8BC34A', '#CDDC39', '#FFC107'],
      });

      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, 1500);
      return;
    }

    // Animate transition
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((idx) => Math.min(idx + 1, steps.length - 1));
      setIsTransitioning(false);
    }, 300);
  };

  const stepTitle = step.title || `Step ${stepNumber}`;
  const stepBody = step.body || step.instruction;

  return (
    <div className="guided-lesson">
      <div className="guided-lesson__header">
        <div className="guided-lesson__progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-text">
            Step {stepNumber} of {steps.length} • {progress}% complete
          </div>
        </div>
      </div>

      <div className="guided-lesson__body">
        <div className="guided-lesson__main">
          <div
            className={`step-card ${isTransitioning ? 'transitioning' : 'active'} ${showSuccess ? 'success' : ''}`}
          >
            <div className="step-header">
              <div className="step-number">Step {stepNumber}</div>
              <h3>{stepTitle}</h3>
            </div>
            <div className="step-content">
              {stepBody && <p style={{ whiteSpace: 'pre-line' }}>{stepBody}</p>}

              {step.videoUrl && (
                <div className="step-video">
                  <iframe
                    width="100%"
                    height="400"
                    src={step.videoUrl}
                    title={stepTitle}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {step.imageUrl && (
                <div className="step-image">
                  <img src={step.imageUrl} alt={lesson.title} />
                </div>
              )}
            </div>
          </div>

          <div className="guided-lesson__footer">
            <button type="button" className="btn-secondary" onClick={handlePrev} disabled={isFirst}>
              Previous
            </button>

            <span className="lesson-runner__counter">
              Step {stepNumber} / {steps.length}
            </span>

            <button type="button" className="btn-primary" onClick={handleNext}>
              {isLast ? (uiMode === 'kid' ? 'All done!' : 'Finish Session') : 'Next Step'}
            </button>
          </div>
        </div>

        <aside className="guided-lesson__coach">
          <h3>{uiMode === 'kid' ? 'Your music coach' : 'Practice coach'}</h3>
          <p>{coachMessage}</p>
        </aside>
      </div>
    </div>
  );
}

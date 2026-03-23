import { useEffect, useMemo, useState } from 'react';

export default function LessonRunner({
  lesson,
  uiMode,
  initialStepIndex = 0,
  onProgressChange,
  onComplete,
}) {
  const steps = useMemo(() => {
    if (!lesson || !Array.isArray(lesson.steps)) return [];

    const withNumbers = lesson.steps.map((step, idx) => {
      const stepNumber =
        step.step_number ?? step.stepNumber ?? step.index ?? step.orderIndex ?? idx + 1;

      return {
        ...step,
        _stepNumber: stepNumber,
      };
    });

    return withNumbers.slice().sort((a, b) => a._stepNumber - b._stepNumber);
  }, [lesson]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!steps.length) return 0;
    const clamped = Math.min(Math.max(initialStepIndex || 0, 0), steps.length - 1);
    return clamped;
  });

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
      <div className="lesson-runner">
        <div className="lesson-runner__empty">
          <p>No steps are defined for this lesson yet.</p>
        </div>
      </div>
    );
  }

  const step = steps[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  const handlePrev = () => {
    if (isFirst) return;
    setCurrentIndex((idx) => Math.max(idx - 1, 0));
  };

  const handleNext = () => {
    if (isLast) {
      if (onComplete) {
        onComplete();
      }
      return;
    }

    setCurrentIndex((idx) => Math.min(idx + 1, steps.length - 1));
  };

  const stepNumber = step._stepNumber ?? currentIndex + 1;

  return (
    <div className="lesson-runner">
      <div className="lesson-runner__header">
        <h2 className="lesson-runner__title">
          Lesson Steps
          <span className="lesson-runner__step-indicator">
            Step {stepNumber} of {steps.length}
          </span>
        </h2>
      </div>

      <div className="lesson-runner__body">
        {step.instruction && <p className="lesson-runner__instruction">{step.instruction}</p>}

        {(step.visualAssetUrl || step.visual_asset_url) && (
          <div className="lesson-runner__visual">
            <img src={step.visualAssetUrl || step.visual_asset_url} alt={lesson.title} />
          </div>
        )}
      </div>

      <div className="lesson-runner__footer">
        <button type="button" className="btn-secondary" onClick={handlePrev} disabled={isFirst}>
          Previous
        </button>

        <span className="lesson-runner__counter">
          Step {stepNumber} / {steps.length}
        </span>

        <button type="button" className="btn-primary" onClick={handleNext}>
          {isLast ? (uiMode === 'kid' ? 'All done!' : 'Finish Lesson') : 'Next Step'}
        </button>
      </div>
    </div>
  );
}

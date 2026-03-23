import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllLessons } from '../services/lessonService';
import { useInstrument } from '../context/InstrumentContext';
import { useUserMode } from '../context/AuthContext';
import LessonCard from '../components/LessonCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function LessonsPage() {
  const navigate = useNavigate();
  const { activeInstrument } = useInstrument();
  const [lessons, setLessons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllLessons, setShowAllLessons] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    difficulty: '',
    search: '',
  });
  const uiMode = useUserMode();

  useEffect(() => {
    // Redirect to instrument selector if no active instrument
    if (!activeInstrument) {
      navigate('/instruments');
      return;
    }
    loadLessons();
  }, [filters, activeInstrument, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLessons = async () => {
    if (!activeInstrument) return;

    try {
      setIsLoading(true);
      setError(null);
      const filterParams = {
        ...filters,
        instrumentId: activeInstrument.id,
      };
      const data = await getAllLessons(filterParams);
      setLessons(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value,
    });
  };

  const filteredLessons =
    uiMode === 'kid' && !showAllLessons
      ? lessons.filter((lesson) => {
          const tags = lesson.tags || [];
          return Array.isArray(tags) && (tags.includes('kid') || tags.includes('session'));
        })
      : lessons;

  // Derive progress/completion using v2 fields when available
  const withProgress = filteredLessons.map((lesson) => {
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

  // Find a reasonable "continue" lesson: first in-progress, else first not completed, else first overall
  const continueLesson =
    withProgress.find((l) => !l.__completed && l.__currentStep) ||
    withProgress.find((l) => !l.__completed) ||
    withProgress[0] ||
    null;

  // Split lessons into beginner vs intermediate/advanced buckets
  const beginnerLessons = withProgress.filter((lesson) => lesson.difficulty === 'beginner');
  const intermediateAdvancedLessons = withProgress.filter(
    (lesson) => lesson.difficulty === 'intermediate' || lesson.difficulty === 'advanced'
  );

  const hasIntermediatePlusCompleted = intermediateAdvancedLessons.some(
    (lesson) => lesson.__completed
  );

  const [beginnerOpen, setBeginnerOpen] = useState(true);
  const [intermediateOpen, setIntermediateOpen] = useState(false);
  const [sectionsInitialized, setSectionsInitialized] = useState(false);

  // Re-initialize accordion defaults when instrument changes
  useEffect(() => {
    setSectionsInitialized(false);
  }, [activeInstrument?.id]);

  // Default accordion behavior:
  // - If no intermediate/advanced lessons completed yet: Beginner open, higher level collapsed
  // - Once any intermediate/advanced lesson is completed: Beginner collapsed, higher level open
  useEffect(() => {
    if (!sectionsInitialized) {
      if (hasIntermediatePlusCompleted) {
        setBeginnerOpen(false);
        setIntermediateOpen(true);
      } else {
        setBeginnerOpen(true);
        setIntermediateOpen(false);
      }
      setSectionsInitialized(true);
    }
  }, [sectionsInitialized, hasIntermediatePlusCompleted]);

  if (isLoading) {
    return (
      <div className="lessons-page">
        <div className="container">
          <LoadingSpinner message="Loading your lessons..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lessons-page">
        <div className="container">
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="lessons-page">
      <div className="container">
        <header className="page-header">
          <h1>{activeInstrument?.display_name || 'Instrument'} Lessons</h1>
          <p>
            Choose a lesson to continue your{' '}
            {activeInstrument?.display_name?.toLowerCase() || 'instrument'} journey
          </p>
        </header>

        {uiMode === 'kid' && (
          <div className="kid-lessons-toggle" style={{ marginBottom: '1rem' }}>
            <label>
              <input
                type="checkbox"
                checked={showAllLessons}
                onChange={(e) => setShowAllLessons(e.target.checked)}
              />{' '}
              Show all lessons
            </label>
          </div>
        )}

        <div className="filters">
          <input
            type="text"
            name="search"
            placeholder="Search lessons..."
            value={filters.search}
            onChange={handleFilterChange}
            className="filter-input"
          />

          <select
            name="category"
            value={filters.category}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">All Categories</option>
            <option value="fundamentals">Fundamentals</option>
            <option value="chords">Chords</option>
            <option value="scales">Scales</option>
            <option value="techniques">Techniques</option>
            <option value="songs">Songs</option>
            <option value="theory">Theory</option>
          </select>

          <select
            name="difficulty"
            value={filters.difficulty}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        {/* Continue card */}
        {continueLesson && (
          <section className="lessons-continue" style={{ marginBottom: '2rem' }}>
            <h2>Continue your journey</h2>
            <div className="lessons-grid">
              <LessonCard lesson={continueLesson} />
            </div>
          </section>
        )}

        {withProgress.length === 0 ? (
          <div className="no-results">
            <p>No lessons found matching your filters.</p>
          </div>
        ) : (
          <div className="lessons-accordions">
            {beginnerLessons.length > 0 && (
              <section className="lessons-accordion">
                <button
                  type="button"
                  className="lessons-accordion-header"
                  onClick={() => setBeginnerOpen((prev) => !prev)}
                >
                  <h2>Beginner Lessons</h2>
                  <span
                    className={`lessons-accordion-chevron ${
                      beginnerOpen ? 'lessons-accordion-chevron--open' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {beginnerOpen && (
                  <div className="lessons-accordion-body">
                    <div className="lessons-grid">
                      {beginnerLessons
                        .slice()
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map((lesson) => (
                          <LessonCard key={lesson.id} lesson={lesson} />
                        ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {intermediateAdvancedLessons.length > 0 && (
              <section className="lessons-accordion">
                <button
                  type="button"
                  className="lessons-accordion-header"
                  onClick={() => setIntermediateOpen((prev) => !prev)}
                >
                  <h2>Intermediate &amp; Advanced Lessons</h2>
                  <span
                    className={`lessons-accordion-chevron ${
                      intermediateOpen ? 'lessons-accordion-chevron--open' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {intermediateOpen && (
                  <div className="lessons-accordion-body">
                    <div className="lessons-grid">
                      {intermediateAdvancedLessons
                        .slice()
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map((lesson) => (
                          <LessonCard key={lesson.id} lesson={lesson} />
                        ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

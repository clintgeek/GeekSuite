/**
 * Lessons Service
 *
 * Fetches lesson content from the backend API
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Get all lessons for a language
 */
export async function getLessons(language = 'spanish') {
  const response = await fetch(`${API_BASE}/lessons/${language}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch lessons: ${response.status}`);
  }
  const data = await response.json();
  return data.data.lessons;
}

/**
 * Get learning path (units with lessons) for a language
 */
export async function getLearningPath(language = 'spanish') {
  const response = await fetch(`${API_BASE}/lessons/${language}/path`);
  if (!response.ok) {
    throw new Error(`Failed to fetch learning path: ${response.status}`);
  }
  const data = await response.json();
  return data.data.units;
}

/**
 * Get a single lesson by slug
 */
export async function getLesson(slug, language = 'spanish') {
  const response = await fetch(`${API_BASE}/lessons/${language}/${slug}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch lesson: ${response.status}`);
  }
  const data = await response.json();
  return data.data.lesson;
}

export default {
  getLessons,
  getLearningPath,
  getLesson
};

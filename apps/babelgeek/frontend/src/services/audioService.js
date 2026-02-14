/**
 * Audio Service for BabelGeek
 *
 * Uses pre-generated ElevenLabs audio from the backend.
 * Falls back to browser TTS only if backend is unavailable.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Cache for audio elements to avoid re-fetching
const audioCache = new Map();

// Debounce tracking - prevents rapid repeated clicks
let lastPlayTime = 0;
const DEBOUNCE_MS = 2000;

/**
 * Play audio for the given text in the specified language
 * @param {string} text - The text to speak
 * @param {string} languageCode - Language code (e.g., 'es', 'fr')
 * @returns {Promise<void>}
 */
export async function playAudio(text, languageCode = 'es') {
  // Debounce - ignore if clicked within 2 seconds
  const now = Date.now();
  if (now - lastPlayTime < DEBOUNCE_MS) {
    return;
  }
  lastPlayTime = now;

  try {
    // Try to use the backend TTS service
    const audioUrl = await getAudioUrl(text, languageCode);
    await playFromUrl(audioUrl);
  } catch (error) {
    console.warn('Backend TTS failed, falling back to browser TTS:', error);
    playBrowserTTS(text, languageCode);
  }
}

/**
 * Get audio URL from the backend (generates on-demand if needed)
 * @param {string} text - The text to get audio for
 * @param {string} languageCode - Language code
 * @returns {Promise<string>} - The audio URL
 */
export async function getAudioUrl(text, languageCode = 'es') {
  const cacheKey = `${languageCode}:${text}`;

  // Check cache first
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  // Request audio from backend
  const response = await fetch(`${API_BASE}/audio/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, languageCode })
  });

  if (!response.ok) {
    throw new Error(`Audio generation failed: ${response.status}`);
  }

  const data = await response.json();
  const audioUrl = `${API_BASE}${data.audioUrl.replace('/api', '')}`;

  // Cache the URL
  audioCache.set(cacheKey, audioUrl);

  return audioUrl;
}

/**
 * Play audio from a URL
 * @param {string} url - The audio URL
 * @returns {Promise<void>}
 */
export function playFromUrl(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);

    audio.onended = () => resolve();
    audio.onerror = (e) => reject(new Error(`Audio playback failed: ${e.message}`));

    audio.play().catch(reject);
  });
}

/**
 * Fallback to browser's SpeechSynthesis API
 * @param {string} text - The text to speak
 * @param {string} languageCode - Language code
 */
export function playBrowserTTS(text, languageCode = 'es') {
  const langMap = {
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
    pt: 'pt-BR'
  };

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langMap[languageCode] || 'es-ES';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any currently playing audio
 */
export function stopAudio() {
  window.speechSynthesis.cancel();
}

export default {
  playAudio,
  getAudioUrl,
  playFromUrl,
  playBrowserTTS,
  stopAudio
};

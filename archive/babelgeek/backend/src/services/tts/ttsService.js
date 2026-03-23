/**
 * TTS Service for BabelGeek
 *
 * Generates audio files for language learning content using ElevenLabs.
 * Falls back to Azure TTS if ElevenLabs fails.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ElevenLabs voice IDs for different languages
const ELEVENLABS_VOICES = {
  es: "pFZP5JQG7iQjIQuC4Bku", // Lily - Spanish female
  fr: "EXAVITQu4vr4xnSDxMaL", // Sarah - French female
  de: "onwK4e9ZLuTAKqWW03F9", // Daniel - German male
  it: "pFZP5JQG7iQjIQuC4Bku", // Lily - Italian
  pt: "pFZP5JQG7iQjIQuC4Bku"  // Lily - Portuguese
};

// Azure voice names for different languages
const AZURE_VOICES = {
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  it: "it-IT-ElsaNeural",
  pt: "pt-BR-FranciscaNeural"
};

/**
 * Generate a unique filename based on text and language
 */
function generateFilename(text, languageCode) {
  const hash = crypto.createHash("md5").update(text).digest("hex").slice(0, 8);
  const safeText = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);
  return `${safeText}-${hash}.mp3`;
}

/**
 * Generate audio using ElevenLabs API
 */
async function generateWithElevenLabs(text, languageCode, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const voiceId = ELEVENLABS_VOICES[languageCode] || ELEVENLABS_VOICES.es;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  return outputPath;
}

/**
 * Generate audio using Azure TTS API
 */
async function generateWithAzure(text, languageCode, outputPath) {
  const apiKey = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION || "eastus";

  if (!apiKey) {
    throw new Error("AZURE_TTS_KEY not configured");
  }

  const voiceName = AZURE_VOICES[languageCode] || AZURE_VOICES.es;

  // Get access token
  const tokenResponse = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Length": "0"
      }
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Azure token error: ${tokenResponse.status}`);
  }

  const accessToken = await tokenResponse.text();

  // Generate speech
  const ssml = `
    <speak version='1.0' xml:lang='${languageCode}'>
      <voice name='${voiceName}'>
        <prosody rate='0.9'>${text}</prosody>
      </voice>
    </speak>
  `;

  const speechResponse = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3"
      },
      body: ssml
    }
  );

  if (!speechResponse.ok) {
    throw new Error(`Azure TTS error: ${speechResponse.status}`);
  }

  const audioBuffer = await speechResponse.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  return outputPath;
}

/**
 * Main TTS generation function
 * Tries ElevenLabs first, falls back to Azure
 */
export async function generateAudio(text, languageCode, audioDir) {
  const filename = generateFilename(text, languageCode);
  const outputPath = path.join(audioDir, filename);

  // Check if already exists
  if (fs.existsSync(outputPath)) {
    return { path: outputPath, filename, cached: true };
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let provider = "elevenlabs";

  try {
    await generateWithElevenLabs(text, languageCode, outputPath);
  } catch (elevenLabsError) {
    console.warn(`ElevenLabs failed: ${elevenLabsError.message}, trying Azure...`);
    provider = "azure";

    try {
      await generateWithAzure(text, languageCode, outputPath);
    } catch (azureError) {
      throw new Error(`All TTS providers failed. ElevenLabs: ${elevenLabsError.message}, Azure: ${azureError.message}`);
    }
  }

  return { path: outputPath, filename, cached: false, provider };
}

/**
 * Extract all text that needs audio from a lesson
 */
export function extractAudioTexts(lesson) {
  const texts = [];
  const languageCode = lesson.languageCode;

  // Vocabulary words
  if (lesson.content?.vocabulary) {
    for (const word of lesson.content.vocabulary) {
      texts.push({ text: word, type: "vocabulary", languageCode });
    }
  }

  // Step content
  if (lesson.content?.steps) {
    for (const step of lesson.content.steps) {
      // Phrases for listen_repeat steps
      if (step.type === "listen_repeat" && step.phrase) {
        texts.push({ text: step.phrase, type: "phrase", languageCode });
      }

      // Matching pairs - left side (target language)
      if (step.type === "matching" && step.pairs) {
        for (const pair of step.pairs) {
          texts.push({ text: pair.left, type: "matching", languageCode });
        }
      }
    }
  }

  return texts;
}

export default {
  generateAudio,
  extractAudioTexts
};

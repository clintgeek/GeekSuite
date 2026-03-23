/**
 * Audio/TTS Routes
 *
 * Serves pre-generated audio files or generates on-demand.
 */

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { generateAudio } from "../services/tts/ttsService.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, "../../public/audio");

/**
 * GET /api/audio/:languageCode/:filename
 * Serve a pre-generated audio file
 */
router.get("/:languageCode/:filename", (req, res) => {
  const { languageCode, filename } = req.params;
  const filePath = path.join(AUDIO_DIR, languageCode, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Audio file not found" });
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache
  fs.createReadStream(filePath).pipe(res);
});

/**
 * POST /api/audio/generate
 * Generate audio on-demand for a text
 * Body: { text: string, languageCode: string }
 */
router.post("/generate", async (req, res) => {
  try {
    const { text, languageCode } = req.body;

    if (!text || !languageCode) {
      return res.status(400).json({ error: "text and languageCode are required" });
    }

    const audioDir = path.join(AUDIO_DIR, languageCode);
    const result = await generateAudio(text, languageCode, audioDir);

    res.json({
      success: true,
      audioUrl: `/api/audio/${languageCode}/${result.filename}`,
      cached: result.cached,
      provider: result.provider
    });
  } catch (err) {
    console.error("Audio generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audio/speak/:languageCode
 * Generate and stream audio directly (for quick playback)
 * Query: ?text=hello
 */
router.get("/speak/:languageCode", async (req, res) => {
  try {
    const { languageCode } = req.params;
    const { text } = req.query;

    if (!text) {
      return res.status(400).json({ error: "text query parameter is required" });
    }

    const audioDir = path.join(AUDIO_DIR, languageCode);
    const result = await generateAudio(text, languageCode, audioDir);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    fs.createReadStream(result.path).pipe(res);
  } catch (err) {
    console.error("Audio speak error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

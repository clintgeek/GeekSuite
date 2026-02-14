import mongoose from "mongoose";

const VocabularySchema = new mongoose.Schema(
  {
    word: { type: String, required: true },
    translation: { type: String, required: true },
    languageCode: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },
    level: {
      type: String,
      required: true,
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
      index: true
    },
    partOfSpeech: {
      type: String,
      enum: ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "phrase"]
    },
    gender: {
      type: String,
      enum: ["masculine", "feminine", "neutral", null]
    },
    audioUrl: String,
    imageUrl: String,
    phonetic: String,
    exampleSentence: String,
    exampleTranslation: String,
    tags: [String],
    lessonSlug: String // which lesson introduced this word
  },
  { timestamps: true }
);

// Index for efficient vocabulary queries
VocabularySchema.index({ languageCode: 1, level: 1 });
VocabularySchema.index({ word: 1, languageCode: 1 }, { unique: true });

export default mongoose.model("Vocabulary", VocabularySchema);

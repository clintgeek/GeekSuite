# BabelGeek – The Plan

## Vision

BabelGeek is a modern language learning platform that makes acquiring new languages engaging, effective, and fun. Inspired by Duolingo's proven methodology but tailored for the Geek Suite ecosystem, BabelGeek delivers bite-sized lessons, conversation practice, and gamified progress tracking.

## Core Concepts

| Concept        | Description                                                                 |
|----------------|-----------------------------------------------------------------------------|
| **Language**   | The target language being learned (Spanish, French, etc.)                  |
| **Level**      | CEFR-aligned proficiency (A1, A2, B1, B2, C1, C2)                          |
| **Lesson**     | A focused, template-driven learning session (5-15 minutes)                 |
| **LearningPath** | A curated sequence of lessons organized into units                        |
| **Conversation** | AI-powered practice dialogues with speech recognition                     |
| **Vocabulary** | Word/phrase collections with spaced repetition                             |

## Design Principles

- **FitnessGeek Colors**: Cyan primary (#06b6d4), Slate secondary (#64748b), dark/light mode
- **MusicGeek Architecture**: JSON-driven lessons, template rendering, path-based progression
- **Mobile-First**: PWA with offline support, touch-optimized UI
- **Gamified**: XP, streaks, achievements, leaderboards

---

## Phases

### Phase 1 – Foundation & Project Setup

**Goal**: Scaffold the project from TemplateGeek, establish models, and create the content pipeline.

#### Backend Tasks

1. **Copy TemplateGeek structure** to BabelGeek (backend/, frontend/, docker-compose.yml)
2. **Create MongoDB models**:
   - `Language` – id, code (es, fr, de), name, flag emoji, isActive
   - `Lesson` – slug, template, languageCode, level, orderIndex, meta, content
   - `LearningPath` – slug, languageCode, level, template, units with lessonSlugs
   - `Vocabulary` – word, translation, languageCode, level, audioUrl, imageUrl
   - `UserProgress` – userId, lessonSlug, status, completedAt, score, xpEarned
   - `UserVocabulary` – userId, vocabularyId, strength, nextReviewAt (SRS)
   - `Conversation` – userId, languageCode, scenario, messages[], createdAt
3. **Create content directories**:
   - `backend/content/lessons/spanish/*.json`
   - `backend/content/lessons/french/*.json`
   - `backend/content/paths/*.json`
   - `backend/content/vocabulary/*.json`
4. **Implement sync-content script**:
   - Read JSON files, upsert to MongoDB by slug
   - `npm run content:sync`
5. **Set up routes**:
   - `GET /api/languages` – list available languages
   - `GET /api/lessons/:languageCode/:level` – list lessons
   - `GET /api/lessons/:slug` – get single lesson
   - `GET /api/paths/:languageCode/:level` – get learning path
   - `GET /api/vocabulary/:languageCode/:level` – get vocabulary set
   - `POST /api/progress/:lessonSlug` – record completion
   - `POST /api/conversation` – AI conversation endpoint

#### Frontend Tasks

1. **Apply fitnessGeek theme**:
   - Primary: `#06b6d4` (cyan-500), `#22d3ee` (cyan-400)
   - Secondary: `#64748b` (slate-500)
   - Font: Inter
   - Border radius: 24px (cards), 16px (buttons)
2. **Create base layout**: AppBar, BottomNav, theme toggle
3. **Add placeholder pages**: Home, Learn, Lessons, Stats, Profile

#### Deliverables
- [ ] Backend scaffolded with models & routes
- [ ] Frontend with fitnessGeek theme applied
- [ ] Docker Compose working (dev environment)
- [ ] At least 3 Spanish A1 lessons in JSON

---

### Phase 2 – Lesson Templates & Rendering

**Goal**: Build the lesson experience with template-driven rendering.

#### Lesson JSON Structure
```json
{
  "slug": "spanish-greetings-basics",
  "template": "guided_steps_v1",
  "languageCode": "es",
  "level": "A1",
  "orderIndex": 1,
  "meta": {
    "title": "Greetings & Introductions",
    "subtitle": "Learn to say hello and introduce yourself",
    "category": "Basics",
    "difficulty": 1,
    "estimatedTimeMinutes": 10,
    "xpReward": 50,
    "imageUrl": "/assets/lessons/spanish/greetings/hero.svg"
  },
  "content": {
    "learningOutcomes": [
      "Say hello and goodbye in Spanish",
      "Introduce yourself with your name",
      "Ask someone's name"
    ],
    "vocabulary": ["hola", "adiós", "me llamo", "¿cómo te llamas?"],
    "steps": [
      {
        "id": "intro",
        "type": "text+audio",
        "title": "¡Hola!",
        "body": "The most common greeting in Spanish is **hola** (hello).",
        "audioUrl": "/audio/es/hola.mp3"
      },
      {
        "id": "listen-repeat",
        "type": "listen_repeat",
        "title": "Listen & Repeat",
        "phrase": "¡Hola! Me llamo María.",
        "translation": "Hello! My name is María.",
        "audioUrl": "/audio/es/hola-me-llamo-maria.mp3"
      },
      {
        "id": "match",
        "type": "matching",
        "title": "Match the pairs",
        "pairs": [
          { "left": "Hola", "right": "Hello" },
          { "left": "Adiós", "right": "Goodbye" },
          { "left": "Me llamo", "right": "My name is" }
        ]
      },
      {
        "id": "checkpoint",
        "type": "checkpoint",
        "title": "Quick check",
        "body": "Great! You've learned basic Spanish greetings."
      },
      {
        "id": "celebration",
        "type": "celebration",
        "title": "🎉 ¡Fantástico!",
        "body": "You just completed your first Spanish lesson! Keep practicing to unlock more."
      }
    ]
  }
}
```

#### Step Types

| Type            | Description                                           |
|-----------------|-------------------------------------------------------|
| `text`          | Text content only                                     |
| `text+image`    | Text with illustrative image                          |
| `text+audio`    | Text with native speaker audio playback               |
| `listen_repeat` | Audio + speech recognition for pronunciation          |
| `matching`      | Drag-and-drop matching pairs                          |
| `multiple_choice` | Select correct translation/answer                   |
| `fill_blank`    | Complete the sentence with correct word               |
| `type_answer`   | Type the translation                                  |
| `checkpoint`    | Summary/progress marker                               |
| `celebration`   | End-of-lesson celebration with XP award               |

#### Frontend Components

1. **LessonTemplateRenderer** – routes `lesson.template` to component
2. **GuidedStepsTemplate** – Duolingo-style step-through experience
3. **Step Components**:
   - `TextStep`, `TextImageStep`, `TextAudioStep`
   - `ListenRepeatStep` (with Web Speech API)
   - `MatchingStep` (drag & drop or tap)
   - `MultipleChoiceStep`
   - `FillBlankStep`, `TypeAnswerStep`
   - `CheckpointStep`, `CelebrationStep`
4. **Progress Bar** – shows lesson progress at top
5. **Audio Player** – for TTS and recorded audio

#### Backend Enhancements

1. **TTS Service** (text-to-speech):
   - Integrate OpenAI TTS or ElevenLabs for native pronunciation
   - Cache generated audio files
   - `GET /api/audio/:languageCode/:phrase`
2. **Pronunciation scoring** (future):
   - Compare user speech to reference
   - Return similarity score

#### Deliverables
- [ ] `guided_steps_v1` template fully implemented
- [ ] All step types rendered with proper interactions
- [ ] Audio playback working
- [ ] Lesson completion flow (XP award, progress save)
- [ ] At least 10 Spanish A1 lessons created

---

### Phase 3 – Learning Paths & Vocabulary

**Goal**: Organize lessons into structured paths and add vocabulary drilling.

#### Learning Path JSON Structure
```json
{
  "slug": "spanish-a1-beginner",
  "languageCode": "es",
  "level": "A1",
  "template": "linear_units_v1",
  "title": "Spanish for Beginners",
  "subtitle": "Start your Spanish journey from zero",
  "content": {
    "units": [
      {
        "id": "greetings",
        "title": "Greetings & Basics",
        "lessons": ["spanish-greetings-basics", "spanish-introductions", "spanish-numbers-1-10"]
      },
      {
        "id": "everyday",
        "title": "Everyday Phrases",
        "lessons": ["spanish-common-phrases", "spanish-asking-directions", "spanish-at-the-cafe"]
      }
    ]
  }
}
```

#### Vocabulary System

- **Spaced Repetition (SRS)**: Track word strength (0-5), schedule reviews
- **Vocabulary Cards**: Flip cards with word, translation, audio, example sentence
- **Quick Review**: Session of 10-20 words based on SRS scheduling
- **Vocabulary model** includes: word, translation, languageCode, partOfSpeech, audioUrl, imageUrl, exampleSentence

#### Frontend Pages

1. **LearnPage** – Language selection, path overview with units
2. **UnitPage** – List of lessons in unit, completion status
3. **VocabularyPage** – Flashcard review mode
4. **PathProgressWidget** – Visual progress through path

#### Deliverables
- [ ] Learning paths displayed with unit structure
- [ ] Lesson unlock logic (complete previous to unlock next)
- [ ] Vocabulary flashcard component
- [ ] SRS algorithm implemented (basic SM-2 or similar)
- [ ] At least 200 vocabulary words for Spanish A1

---

### Phase 4 – Conversations & AI Practice

**Goal**: Enable free-form conversation practice with AI.

#### Conversation System

1. **Scenario-based prompts**:
   - "You're at a coffee shop in Madrid..."
   - "You're meeting your Spanish teacher..."
   - "You're ordering food at a restaurant..."
2. **AI Backend**:
   - Use OpenAI GPT-4 for conversation
   - System prompt includes learner's level, vocabulary limits
   - Gentle corrections with explanations
3. **Speech-to-Text**:
   - Web Speech API for browser STT
   - Whisper API for higher accuracy (optional)
4. **Text-to-Speech**:
   - AI responses spoken aloud
   - Adjustable speed for learners

#### Conversation Flow

```
User: "Hola, quiero un café" (spoken or typed)
AI: "¡Hola! ¿Grande o pequeño?"
    [Small note: 'quiero' = I want. Nice use!]
User: "Grande, por favor"
AI: "Perfecto. ¿Algo más?"
```

#### Frontend Components

1. **ConversationPage** – Chat interface with audio I/O
2. **ScenarioSelector** – Choose conversation context
3. **MessageBubble** – Display messages with translation toggle
4. **SpeechButton** – Push-to-talk for voice input
5. **ConversationSummary** – Post-session vocab/grammar review

#### Deliverables
- [ ] Basic conversation flow working
- [ ] At least 5 conversation scenarios
- [ ] Speech input and output integrated
- [ ] Conversation history saved
- [ ] Level-appropriate vocabulary enforcement

---

### Phase 5 – Gamification & Social

**Goal**: Make learning sticky with achievements, streaks, and friendly competition.

#### Gamification Features

1. **XP System**:
   - Lesson completion: 50-100 XP
   - Vocabulary review: 10 XP per 10 words
   - Conversation: 25 XP per session
   - Daily bonus: 2x XP for first lesson
2. **Streaks**:
   - Track consecutive days of practice
   - Streak freeze (1 use per week)
   - Streak milestones (7, 30, 100, 365 days)
3. **Achievements**:
   - First Lesson, First Conversation, 100 Words Learned
   - Night Owl (practice after 10pm), Early Bird (before 7am)
   - Perfectionist (100% on 10 lessons)
4. **Levels & Ranks**:
   - XP thresholds unlock visual ranks
   - Profile badges
5. **Leaderboards** (optional):
   - Weekly XP rankings among friends
   - Global language-specific boards

#### Frontend Components

1. **XPCounter** – Animated XP display
2. **StreakWidget** – Flame icon with count
3. **AchievementsPage** – Grid of earned/locked achievements
4. **LevelProgressBar** – Progress to next rank
5. **StatsPage** – Charts for activity, vocab growth, lesson history

#### Deliverables
- [ ] XP tracking and display
- [ ] Streak system with notifications
- [ ] 20+ achievements defined and tracked
- [ ] Stats dashboard with charts
- [ ] Level/rank system

---

### Phase 6 – Polish & Production

**Goal**: Optimize for real users and prepare for launch.

#### Performance

- [ ] Audio preloading for lessons
- [ ] Image optimization (WebP, lazy loading)
- [ ] API response caching
- [ ] PWA offline mode for downloaded lessons

#### Quality

- [ ] Comprehensive error handling
- [ ] Loading states and skeletons
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Unit and integration tests

#### Content

- [ ] Complete Spanish A1-A2 curriculum (50+ lessons)
- [ ] French A1 curriculum (20+ lessons)
- [ ] 500+ vocabulary words per language
- [ ] 10+ conversation scenarios per language

#### Deployment

- [ ] Production Docker configuration
- [ ] CI/CD pipeline
- [ ] Monitoring and logging
- [ ] Backup strategy for MongoDB

---

## Out of Scope (For Now)

- Grammar explanations/reference pages
- Writing practice with handwriting recognition
- Multi-player games
- Classroom/teacher features
- Translation tool/dictionary
- Community forums

---

## Tech Stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | React 18, Vite, MUI, Framer Motion           |
| Backend    | Node.js, Express, MongoDB, Mongoose          |
| AI         | OpenAI GPT-4, TTS (OpenAI/ElevenLabs)        |
| Speech     | Web Speech API, Whisper (optional)           |
| Styling    | MUI theming, CSS custom properties           |
| Deployment | Docker, Docker Compose                        |
| Auth       | JWT with SSO (Geek Suite)                    |

---

## Immediate Next Steps

1. Copy TemplateGeek → BabelGeek directory structure
2. Rename branding in all files
3. Apply fitnessGeek cyan theme
4. Create Language and Lesson models
5. Write first 3 Spanish A1 lessons in JSON
6. Implement basic lesson page with `guided_steps_v1` template

Let's build something amazing! 🌍🗣️✨

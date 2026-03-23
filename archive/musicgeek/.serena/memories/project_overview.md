# GuitarGeek Project Overview

## Purpose

GuitarGeek is an interactive web application for learning guitar. It provides structured lessons, chord detection, practice tools, and gamification to help beginners and intermediate guitarists improve their skills.

## Tech Stack

- **Frontend**: React (TypeScript), Vite
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (external: 192.168.1.17:55432)
- **Chord Library**: @tombatossals/chords-db (MIT license)
- **Orchestration**: Docker Compose

## Lesson Structure (30 lessons total)

- **Foundation (1-10)**: Basics before chords (holding guitar, strings, tuning, fretting, strumming, diagrams, melody, transitions, rhythm)
- **Section 1 Chords (11-15)**: A, D, E, Am, Em
- **Section 1 Mastery (22)**: Practice all 5 chords
- **Section 2 Chords (16-21)**: Dm, C, G, F, D7, A7
- **Section 2 Mastery (23)**: Practice all 10 chords + blues
- **Songs (24-30)**: 2-chord, 3-chord, 4-chord progressions, Happy Birthday, 12-bar blues

## Chord Set: "10 Basics"

Standard beginner chords: A, D, E, Am, Em, Dm, C, G, F, D7, A7 (actually 11, plus F)

## Key Technical Details

- Chord database uses suffix "7" for dominant 7ths (not "dominant7")
- Database constraints: UNIQUE(lesson_id, step_number) on lesson_steps table
- SVG chord diagrams: 240x240px with verified fingerings
- Migration system uses datageek_pg_admin user (password: REDACTED)

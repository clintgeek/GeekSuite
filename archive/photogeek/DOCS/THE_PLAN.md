# PhotoGeek – The Plan

## Vision

**PhotoGeek** is a photography learning and project companion app designed to help photography novices (like your middle daughter!) learn camera techniques, understand photography concepts, and develop their skills through AI-guided projects and challenges.

Unlike MusicGeek (which is a structured learning platform), PhotoGeek focuses on **experiential learning through doing** – combining educational content with practical, AI-generated photography projects that teach specific techniques and concepts.

## Core Philosophy

- **Learn by doing**: Projects that combine technique practice with creative challenges
- **Contextual education**: Teach concepts when they're relevant to the current project
- **Progressive skill building**: Start simple, gradually introduce complexity
- **Camera-agnostic but DSLR-focused**: Works for any camera but optimized for DSLR learners
- **Gamified progress**: Track achievements, completed projects, and skill mastery

## Target User

- **Primary**: Photography novices with new DSLRs (ages 12+)
- **Secondary**: Hobbyist photographers wanting to improve specific skills
- **Use case**: Someone who knows how to take a photo but doesn't understand aperture, shutter speed, ISO, composition rules, or when to use different lenses

## Key Features

### 1. AI-Powered Photography Projects

The heart of the app – AI generates creative photography challenges that teach specific techniques:

**Project Structure:**
- **Subject/Theme**: What to photograph (e.g., "a person in motion", "autumn colors", "architectural details")
- **Location/Setting**: Where to shoot (e.g., "golden hour outdoors", "window light indoors", "urban environment")
- **Technique Focus**: What to practice (e.g., "rule of thirds", "shallow depth of field", "panning motion")
- **Camera Settings Guidance**: Suggested mode and settings (e.g., "Aperture Priority, f/2.8, ISO 400")
- **Learning Objectives**: What you'll understand after completing this project

**Example Project:**
```
📸 Project: "Golden Hour Portrait"
🎯 Technique: Backlighting & Exposure Compensation
📍 Location: Outdoors during golden hour (1 hour before sunset)
📷 Camera Settings: Aperture Priority mode, f/2.8-4.0, ISO 100-400
🎓 You'll Learn:
  - How to expose for backlit subjects
  - Using exposure compensation (+1 to +2 stops)
  - Creating rim lighting effects
  - When to use spot metering vs evaluative metering
```

**Project Difficulty Levels:**
- **Beginner**: Auto modes, basic composition, single technique focus
- **Intermediate**: Semi-auto modes (A/S priority), multiple techniques, creative challenges
- **Advanced**: Manual mode, complex lighting, artistic interpretation

### 2. Photography Knowledge Base

Searchable, digestible explanations of photography concepts:

**Camera Fundamentals:**
- Exposure triangle (aperture, shutter speed, ISO)
- Shooting modes (Auto, P, A/Av, S/Tv, M)
- Metering modes (evaluative, spot, center-weighted)
- Focus modes (single, continuous, manual)
- White balance and color temperature

**Lens Knowledge:**
- Focal lengths explained (wide-angle, normal, telephoto)
- Prime vs zoom lenses
- When to use 18mm vs 55mm vs 170mm
- Understanding f-stops and aperture
- Depth of field and bokeh

**Composition Techniques:**
- Rule of thirds
- Golden ratio
- Leading lines
- Framing and negative space
- Symmetry and patterns
- Perspective and angles

**Lighting Concepts:**
- Natural light (golden hour, blue hour, harsh midday)
- Direction of light (front, side, back)
- Quality of light (hard vs soft)
- Using reflectors and diffusers

**Post-Processing Basics:**
- RAW vs JPEG
- Basic editing workflow
- Exposure and contrast adjustments
- Color correction and white balance
- Sharpening and noise reduction

### 3. Camera Settings Guide

Interactive tool to help understand what settings to use:

- **Situation-based recommendations**: "I want to photograph [subject] in [lighting]"
- **Mode selector**: When to use A/Av vs S/Tv vs M
- **Settings calculator**: Input desired effect, get recommended settings
- **Cheat sheets**: Quick reference cards for common scenarios

### 4. Photo Upload & Project Completion

- Upload photos from completed projects
- AI feedback on composition and technique application
- Compare your shot with the project objectives
- Track which projects you've completed
- Build a portfolio of your learning journey

### 5. Skill Tracking & Gamification

Inspired by MusicGeek's XP system:

- **Skill Trees**: Different photography disciplines (portrait, landscape, macro, etc.)
- **Technique Mastery**: Track which techniques you've practiced
- **Achievements/Badges**:
  - "Golden Hour Master" – Complete 10 golden hour projects
  - "Bokeh Boss" – Master shallow depth of field
  - "Manual Mode Maven" – Complete 20 projects in manual mode
- **Streaks**: Consecutive days with photography practice
- **XP System**: Earn points for completing projects, learning concepts, uploading photos

### 6. Daily/Weekly Challenges

- **Daily Photo Challenge**: Quick, simple prompts to keep you shooting
- **Weekly Theme**: Deeper exploration of a specific technique or subject
- **Community Challenges** (future): Share and compare with other users

### 7. Equipment Tracker

- Log your camera body and lenses
- Get project recommendations based on your gear
- Learn what your equipment can and can't do
- Future upgrade recommendations based on your shooting style

## Technical Architecture

### Stack (Following MusicGeek/FitnessGeek Pattern)

**Backend:**
- Node.js + Express
- MongoDB via Mongoose
- JWT authentication
- AI integration (OpenAI API for project generation and photo feedback)

**Frontend:**
- React SPA
- Material-UI (GeekSuite design system)
- Responsive, mobile-first design
- Image upload and display
- Progressive Web App capabilities

**Key Models:**

```javascript
// User
{
  email, password, profile,
  equipment: [{ type: 'camera'|'lens', model, specs }],
  skillLevel: 'beginner'|'intermediate'|'advanced',
  preferences: { favoriteSubjects, availableLocations }
}

// Project
{
  title, description,
  technique: { name, category, difficulty },
  subject, location, lighting,
  cameraSettings: { mode, aperture, shutterSpeed, iso },
  learningObjectives: [String],
  tips: [String],
  difficulty: 'beginner'|'intermediate'|'advanced'
}

// UserProject (Progress)
{
  userId, projectId,
  status: 'assigned'|'in-progress'|'completed',
  photos: [{ url, uploadDate, aiAnalysis }],
  completedDate,
  feedback: String,
  rating: Number
}

// KnowledgeArticle
{
  slug, title, category,
  content: String (markdown),
  difficulty, relatedProjects: [ProjectId],
  tags: [String]
}

// Achievement
{
  userId, achievementType,
  unlockedDate, progress
}
```

### AI Integration Points

1. **Project Generation**: Generate creative, varied projects based on user skill level and preferences
2. **Photo Analysis**: Provide feedback on uploaded photos (composition, exposure, technique application)
3. **Personalized Recommendations**: Suggest next projects based on completed work and skill gaps
4. **Concept Explanations**: Generate beginner-friendly explanations of complex concepts

### Canon Camera Integration 📸

**Great news!** Canon cameras with WiFi/Bluetooth (like the one your daughter is getting) have excellent integration possibilities:

#### Photo Transfer Workflow

**Canon Camera Connect App Integration:**
- Canon cameras use WiFi and Bluetooth for wireless photo transfer to smartphones
- Bluetooth handles initial pairing and quick connection
- WiFi handles the actual high-speed photo transfer
- Photos transfer directly to phone's camera roll
- From there, users can upload to PhotoGeek just like any other photo

**User Experience Flow:**
1. Take photos on Canon DSLR during project
2. Use Canon Camera Connect app to transfer photos to phone via WiFi
3. Open PhotoGeek app, select project, upload photos from camera roll
4. PhotoGeek automatically extracts EXIF data and provides AI feedback

#### EXIF Data Extraction

**Automatic Camera Settings Verification:**
We can extract comprehensive EXIF metadata from uploaded photos using Node.js libraries:

**Available EXIF Data:**
- Camera make and model (e.g., "Canon EOS Rebel T7i")
- Lens used (e.g., "EF-S 18-55mm f/3.5-5.6")
- Shooting mode (Auto, Aperture Priority, Shutter Priority, Manual)
- Aperture (f-stop)
- Shutter speed
- ISO sensitivity
- Focal length (actual and 35mm equivalent)
- Metering mode
- Flash usage
- White balance setting
- Date/time taken
- GPS coordinates (if available)

**Node.js Libraries for EXIF:**
- `exifr` - Fast, versatile, supports JPEG/TIFF/PNG/HEIC
- `ExifReader` - Comprehensive, works in browser and Node.js
- `exif-parser` - Pure JavaScript, no dependencies
- `node-exif` - Easy API for JPEG metadata

**Powerful Features This Enables:**

1. **Settings Verification**
   - "Did you actually use Aperture Priority mode as suggested?"
   - "Your aperture was f/5.6, but the project recommended f/2.8 for shallow depth of field"
   - Verify technique application automatically

2. **Smart Feedback**
   - AI can reference actual settings used in feedback
   - "Your ISO was 3200 which caused noise. Try ISO 400-800 in this lighting next time."
   - Compare settings to project recommendations

3. **Learning Analytics**
   - Track which modes she uses most (is she stuck in Auto?)
   - See progression from Auto → Semi-Auto → Manual modes
   - Identify patterns (always shoots at f/5.6? Suggest experimenting with aperture)

4. **Equipment Insights**
   - Auto-detect camera body and lenses from EXIF
   - "You used your 18-55mm lens at 55mm for this portrait - great choice!"
   - Suggest projects suited to her specific gear

5. **Achievements Based on Real Data**
   - "Manual Mode Maven" - verified by EXIF showing M mode
   - "Golden Hour Hunter" - photos taken during actual golden hour times
   - "Lens Explorer" - used different focal lengths

#### Advanced Integration (Future Possibilities)

**Canon Camera Control API (CCAPI):**
Canon offers a developer API for WiFi-connected cameras:
- RESTful HTTP API over WiFi
- Requires Canon Developer Programme registration
- Enables remote camera control, live view, settings changes
- Could allow PhotoGeek to directly control camera settings for tutorials

**Potential Advanced Features:**
- **Guided Shooting Mode**: App connects to camera, walks through settings in real-time
- **Live View Composition Helper**: Show rule of thirds overlay on phone while shooting
- **Remote Trigger**: Take photos from the app for self-portraits/group shots
- **Settings Presets**: "Load recommended settings for this project to your camera"

**Complexity Note:**
- CCAPI requires developer registration and camera activation
- More complex than EXIF extraction
- Better suited for Phase 3+ after core app is proven
- Could be a premium feature

#### Implementation Strategy

**Phase 1 (MVP):**
- ✅ Standard photo upload from camera roll
- ✅ EXIF extraction from uploaded photos
- ✅ Display camera settings used
- ✅ Basic verification (did they use suggested mode?)

**Phase 2:**
- ✅ AI feedback incorporating EXIF data
- ✅ Settings comparison and suggestions
- ✅ Equipment auto-detection
- ✅ EXIF-based achievements

**Phase 3 (Advanced):**
- 🔮 Explore Canon CCAPI integration
- 🔮 Remote camera control features
- 🔮 Live shooting assistance
- 🔮 Direct camera-to-app transfer (bypassing Camera Connect)

**Technical Notes:**
- EXIF extraction works with JPEG files (most common)
- RAW files contain EXIF but Camera Connect converts to JPEG on transfer anyway
- No special Canon API needed for EXIF - it's standard metadata
- Works with any camera brand, not just Canon (bonus!)

### Content Strategy

**Phase 1 (MVP)**: Seed database with curated projects and knowledge articles
- 50+ beginner projects covering fundamental techniques
- 30+ knowledge articles on core concepts
- Manual curation for quality

**Phase 2**: AI-assisted content generation
- Generate projects on-demand based on user preferences
- Expand knowledge base with AI-generated explanations
- User can request custom projects

**Phase 3**: Community content
- Users can share their own project ideas
- Curated user-generated challenges
- Photo sharing and feedback

## Design & UX

### GeekSuite Design Language
- Consistent with MusicGeek and FitnessGeek
- Primary color: Photography-themed (perhaps a warm amber/gold for golden hour vibes?)
- Clean, image-focused layouts
- Mobile-optimized for on-the-go use

### Key Screens

1. **Dashboard**: Current project, daily challenge, recent uploads, progress stats
2. **Projects**: Browse/search projects, filter by technique/difficulty/subject
3. **Active Project**: Detailed view with objectives, settings guide, upload interface
4. **Knowledge Base**: Searchable articles, organized by category
5. **Camera Guide**: Interactive settings helper
6. **Portfolio**: Your uploaded photos organized by project
7. **Progress**: Skill trees, achievements, statistics
8. **Profile**: Equipment, preferences, account settings

### Mobile-First Considerations
- Camera in pocket → quick project access
- Photo upload directly from camera roll
- Offline access to current project details
- Location-aware project suggestions

## Development Phases

### Phase 1: Foundation (MVP)
- [ ] Basic authentication and user management
- [ ] Project model and seeded project database
- [ ] Project browsing and detail view
- [ ] Knowledge base with core articles
- [ ] Basic progress tracking
- [ ] Simple dashboard

### Phase 2: Core Features
- [ ] AI project generation
- [ ] Photo upload and storage
- [ ] Camera settings guide
- [ ] Equipment tracker
- [ ] Skill tracking and XP system
- [ ] Achievement system

### Phase 3: Intelligence
- [ ] AI photo analysis and feedback
- [ ] Personalized project recommendations
- [ ] Adaptive difficulty
- [ ] Smart project sequencing

### Phase 4: Engagement
- [ ] Daily/weekly challenges
- [ ] Streak tracking
- [ ] Enhanced gamification
- [ ] Portfolio showcase
- [ ] Social features (optional)

### Phase 5: Polish
- [ ] PWA capabilities
- [ ] Offline support
- [ ] Advanced filters and search
- [ ] Export/share features
- [ ] Analytics and insights

## Open Questions & Discussion Points

1. **AI vs Curated Content**: How much should be AI-generated vs manually curated?
   - Pro AI: Infinite variety, personalized
   - Pro Curated: Quality control, pedagogically sound

2. **Photo Storage**: Where to store uploaded photos?
   - Options: AWS S3, Cloudinary, MongoDB GridFS
   - Consider: Cost, performance, image processing needs

3. **Feedback Mechanism**: How detailed should AI photo feedback be?
   - Simple: "Good composition!" vs "Your subject is slightly off-center from the rule of thirds intersection"
   - Balance: Encouraging vs educational

4. **Social Features**: Should users be able to see others' work?
   - Privacy concerns for younger users
   - Motivational benefits of community
   - Moderation requirements

5. **Monetization** (future):
   - Free tier: Limited projects per month, basic features
   - Premium: Unlimited projects, AI feedback, advanced features
   - One-time purchase vs subscription?

6. **~~Camera Integration~~** ✅ **ANSWERED - See "Canon Camera Integration" section above**
   - ✅ EXIF data extraction from uploaded photos - YES, comprehensive metadata available
   - ✅ Verify settings used - YES, can compare to project recommendations
   - ✅ Provide accurate feedback - YES, AI can reference actual camera settings
   - 🔮 Advanced: Canon CCAPI for direct camera control (future consideration)

7. **Project Complexity**: How to structure multi-day/multi-shot projects?
   - Some techniques need multiple attempts
   - Series projects (e.g., "Portrait Series: 5 different lighting setups")

## Success Metrics

- **Engagement**: Projects completed per user per month
- **Learning**: Skill progression (beginner → intermediate → advanced)
- **Retention**: Weekly/monthly active users, streak maintenance
- **Quality**: User ratings of projects and feedback
- **Growth**: New users, referrals, app store ratings

## Inspiration & References

- **MusicGeek**: Lesson structure, progress tracking, gamification
- **FitnessGeek**: Goal setting, tracking, clean UI
- **Duolingo**: Bite-sized learning, streaks, achievements
- **Photography Apps**:
  - PhotoPills (planning and education)
  - GuruShots (challenges and community)
  - VSCO (portfolio and aesthetic)

---

## Next Steps

1. Review and refine this plan together
2. Create THE_STEPS.md with detailed implementation steps
3. Design database schema
4. Create wireframes for key screens
5. Set up project structure (following MusicGeek/FitnessGeek patterns)
6. Begin Phase 1 development

**Let's discuss and iterate on this plan, Chef! What resonates? What needs adjustment?**

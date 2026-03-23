# StoryGeek

A collaborative AI-powered storytelling game that blends DnD mechanics with choose-your-own-adventure narratives.

## Overview

StoryGeek is a fantasy storytelling game where players collaborate with AI to create immersive narratives. The game combines:

- **AI-powered storytelling** with Claude 3 Haiku for rich, consistent narratives
- **Dice mechanics** for chance-based outcomes and tension
- **Player agency** through choices and character development
- **World building** with persistent characters, locations, and story threads

## Features

### Core Gameplay
- **Story Creation**: Start with a simple prompt, let AI build the world
- **Character Development**: Create and evolve characters with rich backstories
- **Dice Integration**: Virtual dice rolls determine outcomes and story direction
- **World Building**: Persistent locations, NPCs, and story threads
- **Player Choices**: Multiple paths and decisions that affect the narrative

### Technical Features
- **Cost Optimized**: Uses Claude 3 Haiku for ~$0.0225 per 200-interaction game
- **Rich Context**: 200K token context window maintains story continuity
- **Multiple APIs**: Fallback support for Groq and Gemini
- **PWA Ready**: Progressive web app for mobile/desktop play
- **GeekSuite Integration**: Follows established patterns and authentication

## Tech Stack

- **Frontend**: React (PWA), Material-UI
- **Backend**: Node.js/Express
- **Database**: MongoDB (shared via baseGeek)
- **Authentication**: baseGeek centralized auth
- **AI**: Claude 3 Haiku (primary), Groq/Gemini (fallback)
- **Deployment**: Docker/Docker Compose

## Cost Analysis

- **200 interactions**: ~$0.0225 (Claude 3 Haiku)
- **500 interactions**: ~$0.056
- **1000 interactions**: ~$0.112

## Development Status

🚧 **In Development** 🚧

- [ ] Project structure setup
- [ ] Core story management system
- [ ] AI integration with multiple providers
- [ ] Dice system implementation
- [ ] Frontend story interface
- [ ] Character and world management
- [ ] baseGeek integration
- [ ] Docker deployment setup

## Getting Started

1. Clone the repository
2. Set up environment variables for AI APIs
3. Install dependencies
4. Start development servers
5. Begin storytelling!

## License

MIT License - see LICENSE file for details.
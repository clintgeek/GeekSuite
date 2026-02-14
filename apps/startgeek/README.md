# StartGeek

A minimal, beautiful browser start page with real-time clock and weather.

## Features

- **Beautiful Clock Display** - Large, modern time display with date
- **Weather Integration** - Real-time weather with 7-day forecast (no API key required)
- **World Clocks** - Buenos Aires and Bengaluru time zones with weather
- **Dynamic Backgrounds** - Random high-quality images from picsum.photos
- **Responsive Design** - Works great on desktop and mobile
- **Modern Tech Stack** - React, Tailwind CSS, Framer Motion

## Quick Start

### Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production (Docker)

```bash
docker-compose up -d
```

Access at `http://localhost:3000`

## Configuration

**No configuration needed!** StartGeek works completely out of the box with:

- **Weather**: Open-Meteo API (free, no API key required)
- **Location**: Auto-detects via IP (ipapi.co)
- **Backgrounds**: picsum.photos (random high-quality images)

## Architecture

```
StartGeek/
├── src/
│   ├── components/
│   │   ├── BackgroundManager.jsx  # Random background images
│   │   ├── DateTime.jsx           # Main clock display
│   │   ├── WeatherStrip.jsx       # Local weather + forecast
│   │   └── WorldClocks.jsx        # World timezone clocks
│   ├── context/
│   │   └── WeatherContext.jsx     # Shared weather state
│   ├── hooks/
│   │   └── useTime.js             # Shared clock timer
│   ├── services/
│   │   └── weatherService.js      # Weather API integration
│   ├── constants.js               # App constants
│   ├── App.jsx
│   └── main.jsx
├── docker-compose.yml
└── package.json
```

### Tech Stack

**Frontend:**
- React 18
- Vite
- Tailwind CSS
- Framer Motion

**APIs (All Free, No Keys Required):**
- Open-Meteo for weather data
- ipapi.co for location detection
- picsum.photos for backgrounds

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Troubleshooting

### Weather Not Loading
- Check browser console for errors
- Ensure internet connection is working
- Open-Meteo API is free and doesn't require keys

### Backgrounds Not Loading
- Check internet connection
- Images load from picsum.photos CDN

## License

MIT License

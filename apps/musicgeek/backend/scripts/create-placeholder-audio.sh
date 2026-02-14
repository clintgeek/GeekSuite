#!/bin/bash

# Create placeholder audio files for MusicGeek lessons
# These are silent MP3 files that can be replaced with real audio later

echo "Creating placeholder audio files..."

# Create directories if they don't exist
mkdir -p frontend/public/assets/audio/{strings,tuning,strumming,melodies}

# Function to create a silent MP3 file
create_silent_mp3() {
    local output_file=$1
    local duration=$2

    # Use ffmpeg to create a silent audio file
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t $duration -q:a 9 -acodec libmp3lame "$output_file" -y 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "✅ Created: $output_file"
    else
        echo "❌ Failed to create: $output_file"
        echo "   (ffmpeg may not be installed)"
    fi
}

# Create placeholder audio files
create_silent_mp3 "frontend/public/assets/audio/strings/all-six-strings.mp3" 3
create_silent_mp3 "frontend/public/assets/audio/tuning/in-tune-all-strings.mp3" 3
create_silent_mp3 "frontend/public/assets/audio/tuning/out-of-tune-comparison.mp3" 3
create_silent_mp3 "frontend/public/assets/audio/strumming/down-up-pattern-60bpm.mp3" 4
create_silent_mp3 "frontend/public/assets/audio/melodies/mary-had-a-little-lamb.mp3" 5

echo ""
echo "========================================="
echo "Placeholder audio files created!"
echo "========================================="
echo ""
echo "⚠️  IMPORTANT: These are SILENT placeholder files."
echo ""
echo "To replace with real audio:"
echo "1. Download CC0 samples from Freesound.org (see DOCS/AUDIO_LICENSE_LOG.md)"
echo "2. Or record your own guitar samples"
echo "3. Replace the files in frontend/public/assets/audio/"
echo ""
echo "The app will work with these placeholders, but lessons won't have audio."
echo ""

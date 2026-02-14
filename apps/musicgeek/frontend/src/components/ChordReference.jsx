import { useState } from 'react';
import { chordLibrary, generateChordSVG } from '../utils/chordGenerator';

const CHORD_CATEGORIES = {
  'Major Chords': ['E', 'A', 'D', 'G', 'C'],
  'Minor Chords': ['Em', 'Am', 'Dm'],
  'Beginner Essentials': ['E', 'A', 'D', 'G', 'C', 'Em', 'Am'],
};

export default function ChordReference() {
  const [selectedChord, setSelectedChord] = useState(null);

  const getChordSVG = (chordKey) => {
    const chord = chordLibrary[chordKey];
    if (!chord) return null;
    return generateChordSVG(chord);
  };

  return (
    <div className="chord-reference">
      <div className="chord-reference__header">
        <h2>Guitar Chord Reference</h2>
        <p className="chord-reference__subtitle">Click any chord to see a larger diagram</p>
      </div>

      <div className="chord-reference__content">
        {Object.entries(CHORD_CATEGORIES).map(([category, chords]) => (
          <div key={category} className="chord-category">
            <h3 className="chord-category__title">{category}</h3>
            <div className="chord-grid">
              {chords.map((chordKey) => {
                const chord = chordLibrary[chordKey];
                if (!chord) return null;

                return (
                  <button
                    key={chordKey}
                    className={`chord-card ${selectedChord === chordKey ? 'chord-card--selected' : ''}`}
                    onClick={() => setSelectedChord(selectedChord === chordKey ? null : chordKey)}
                  >
                    <div className="chord-card__name">{chord.name}</div>
                    <div
                      className="chord-card__diagram"
                      dangerouslySetInnerHTML={{ __html: getChordSVG(chordKey) }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedChord && (
        <div className="chord-detail">
          <div className="chord-detail__header">
            <h3>{chordLibrary[selectedChord]?.name}</h3>
            <button
              className="chord-detail__close"
              onClick={() => setSelectedChord(null)}
              aria-label="Close detail view"
            >
              ×
            </button>
          </div>
          <div
            className="chord-detail__diagram"
            dangerouslySetInnerHTML={{ __html: getChordSVG(selectedChord) }}
          />
          <div className="chord-detail__tips">
            <h4>Tips:</h4>
            <ul>
              <li>
                <strong>O</strong> = Play open string (don&apos;t press any fret)
              </li>
              <li>
                <strong>X</strong> = Don&apos;t play this string
              </li>
              <li>
                <strong>Numbers</strong> = Which finger to use (1=index, 2=middle, 3=ring, 4=pinky)
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

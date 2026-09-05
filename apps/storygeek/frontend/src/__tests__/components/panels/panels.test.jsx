import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../../testUtils';
import CharacterPanel from '../../../components/panels/CharacterPanel';
import PartyPanel from '../../../components/panels/PartyPanel';
import QuestPanel from '../../../components/panels/QuestPanel';
import ScenePanel from '../../../components/panels/ScenePanel';
import JournalDrawer from '../../../components/panels/JournalDrawer';

function withTheme(ui) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('CharacterPanel', () => {
  it('shows a fallback before the player character is established', () => {
    withTheme(<CharacterPanel player={null} />);
    expect(screen.getByText(/will take shape as the tale begins/i)).toBeInTheDocument();
  });

  it('renders the player fixture: name, status, inventory, skills', () => {
    const player = {
      name: 'Kestrel',
      status: 'alive',
      currentState: 'Bruised but standing.',
      inventory: [
        { name: 'Rope', quantity: 1 },
        { name: 'Dagger', quantity: 1, isEquipped: true },
        { name: 'Arrows', quantity: 0 }, // filtered out (0 qty)
      ],
      skills: [{ name: 'Stealth', level: 3 }],
    };
    withTheme(<CharacterPanel player={player} />);
    expect(screen.getByText('Kestrel')).toBeInTheDocument();
    expect(screen.getByText('alive')).toBeInTheDocument();
    expect(screen.getByText('Rope')).toBeInTheDocument();
    expect(screen.getByText('Dagger')).toBeInTheDocument();
    expect(screen.queryByText('Arrows')).not.toBeInTheDocument();
    expect(screen.getByText('Stealth')).toBeInTheDocument();
  });
});

describe('PartyPanel', () => {
  it('shows an empty state with no NPCs present', () => {
    withTheme(<PartyPanel npcs={[]} player={null} story={{}} />);
    expect(screen.getByText(/no one else is here/i)).toBeInTheDocument();
  });

  it('renders present NPCs from the fixture, with relationship and motivation', () => {
    const player = { name: 'Kestrel' };
    const npcs = [
      {
        name: 'Mira',
        motivation: 'Protect the village.',
        relationships: [{ characterName: 'Kestrel', relationshipType: 'ally' }],
        knowledge: [],
      },
    ];
    withTheme(<PartyPanel npcs={npcs} player={player} story={{}} />);
    expect(screen.getByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('ally')).toBeInTheDocument();
    expect(screen.getByText('Protect the village.')).toBeInTheDocument();
  });
});

describe('QuestPanel', () => {
  it('shows an empty state with no open threads', () => {
    withTheme(<QuestPanel threads={[]} />);
    expect(screen.getByText(/no unresolved threads yet/i)).toBeInTheDocument();
  });

  it('renders a thread fixture with its type icon, name and description', () => {
    const threads = [
      { name: 'The Missing Ledger', type: 'quest', description: 'Find who took it.' },
    ];
    withTheme(<QuestPanel threads={threads} />);
    expect(screen.getByText('The Missing Ledger')).toBeInTheDocument();
    expect(screen.getByText('Find who took it.')).toBeInTheDocument();
  });

  it('flags a dormant thread', () => {
    const threads = [
      { name: 'Old Debt', type: 'debt', description: 'Owed to the guild.', dormant: true, age: 20 },
    ];
    withTheme(<QuestPanel threads={threads} />);
    expect(screen.getByText('dormant')).toBeInTheDocument();
  });
});

describe('ScenePanel', () => {
  it('renders the scene fixture: location, day, time, weather, mood', () => {
    const scene = {
      locationName: 'The Rusty Anchor',
      state: 'intact',
      type: 'tavern',
      situation: 'The crowd goes quiet as you enter.',
      mood: 'tense',
      weather: 'rainy',
      timeOfDay: 'evening',
      turn: 4,
      storyDay: 2,
    };
    withTheme(<ScenePanel scene={scene} />);
    expect(screen.getByText('The Rusty Anchor')).toBeInTheDocument();
    expect(screen.getByText('Day 2')).toBeInTheDocument();
    expect(screen.getByText(/tense/)).toBeInTheDocument();
    expect(screen.getByText('The crowd goes quiet as you enter.')).toBeInTheDocument();
  });

  it('falls back to "An unfolding tale" before a location is established', () => {
    // Matches the shape getScene() always produces (type defaults to
    // 'other'), not a raw partial object — ScenePanel expects the projection's
    // defaults, and an undefined `type` crashes its ScenePanel.jsx:40 label.
    withTheme(<ScenePanel scene={{ type: 'other', storyDay: 1, mood: 'neutral', weather: 'clear', timeOfDay: 'day' }} />);
    expect(screen.getByText('An unfolding tale')).toBeInTheDocument();
  });
});

describe('JournalDrawer', () => {
  it('shows the empty state with nothing recorded yet', () => {
    withTheme(<JournalDrawer open onClose={() => {}} story={{}} />);
    expect(screen.getByText(/nothing recorded yet/i)).toBeInTheDocument();
  });

  it('renders established-fact fixtures grouped into their sections', () => {
    const story = {
      characters: [{ name: 'Kestrel', isPlayer: true, knowledge: [] }],
      storyState: {
        establishedFacts: [
          { id: 'f1', fact: 'The mayor is corrupt.', category: 'character', source: 'narrator', turn: 3 },
          { id: 'f2', fact: 'The bridge is out.', category: 'location', source: 'setup' },
        ],
      },
      storyThreads: [],
    };
    withTheme(<JournalDrawer open onClose={() => {}} story={story} />);
    expect(screen.getByText('The mayor is corrupt.')).toBeInTheDocument();
    expect(screen.getByText('The bridge is out.')).toBeInTheDocument();
    expect(screen.getByText(/People/)).toBeInTheDocument();
    expect(screen.getByText(/Places/)).toBeInTheDocument();
  });

  // Icon-only close control: without a name it is an unlabelled button to a
  // screen reader, which is what the axe pass flagged on 07-journal.
  it('names its close control and calls onClose', () => {
    const onClose = vi.fn();
    withTheme(<JournalDrawer open onClose={onClose} story={{}} />);
    const close = screen.getByRole('button', { name: 'Close journal' });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../testUtils';
import Narration from '../../components/Narration';

function renderNarration(content) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <Narration content={content} />
    </ThemeProvider>
  );
}

describe('Narration', () => {
  it('renders **bold** as a strong element, not literal asterisks', () => {
    renderNarration('The door was **locked** tight.');
    const strong = screen.getByText('locked');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('renders *italic* as an em element', () => {
    renderNarration('A *faint* whisper.');
    const em = screen.getByText('faint');
    expect(em.tagName).toBe('EM');
  });

  it('renders a markdown list as ul > li', () => {
    const { container } = renderNarration('- torch\n- rope\n- dagger');
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('torch');
  });

  it('renders a blockquote as a blockquote element', () => {
    const { container } = renderNarration('> The old man warned you.');
    const quote = container.querySelector('blockquote');
    expect(quote).not.toBeNull();
    expect(quote).toHaveTextContent('The old man warned you.');
  });

  it('renders inline code as a code element', () => {
    renderNarration('Roll a `d20` for the check.');
    const code = screen.getByText('d20');
    expect(code.tagName).toBe('CODE');
  });

  it('does not render raw HTML (no rehype-raw pass-through)', () => {
    const { container } = renderNarration('Hello <strong>world</strong>, watch out.');
    // The literal tag text renders inert, not as an actual <strong> element
    // wrapping "world" — react-markdown treats it as plain text.
    const strongs = Array.from(container.querySelectorAll('strong')).filter(
      (el) => el.textContent === 'world'
    );
    expect(strongs).toHaveLength(0);
    expect(container.textContent).toContain('<strong>world</strong>');
  });

  it('balances an unterminated ** so it renders as bold instead of literal asterisks', () => {
    const { container } = renderNarration('The blade glowed **brightly as it struck');
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.textContent).not.toContain('**');
  });

  it('balances an unterminated code fence so it does not swallow trailing content as text', () => {
    const { container } = renderNarration('Before.\n```\nconst x = 1;\nAfter.');
    // The fence closes itself (balanceUnterminatedMarkdown appends a
    // terminator), so the whole thing renders as one code block — trailing
    // "After." is not left dangling as raw fence syntax in the output.
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.textContent).not.toMatch(/```/);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import TemplatePreview from '../../components/templates/TemplatePreview';

const theme = createBuJoTheme('light');

function renderPreview(content, variables) {
  return render(
    <ThemeProvider theme={theme}>
      <TemplatePreview content={content} variables={variables} />
    </ThemeProvider>
  );
}

describe('TemplatePreview', () => {
  it('renders **bold** as a strong element, not literal asterisks', () => {
    renderPreview('Pack the **essentials** for the trip.');
    const strong = screen.getByText('essentials');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('renders a markdown list as ul > li', () => {
    const { container } = renderPreview('- pack\n- plan\n- go');
    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('pack');
  });

  it('substitutes {{variables}} before parsing markdown', () => {
    renderPreview('Hello **{{name}}**, welcome.', { name: 'Chef' });
    const strong = screen.getByText('Chef');
    expect(strong.tagName).toBe('STRONG');
  });

  it('leaves an unmatched {{variable}} as the literal placeholder', () => {
    renderPreview('Due: {{dueDate}}', {});
    expect(screen.getByText('Due: {{dueDate}}')).toBeInTheDocument();
  });

  it('links use the theme primary color, not the browser default blue', () => {
    renderPreview('See [the docs](https://example.com) for details.');
    const link = screen.getByRole('link', { name: 'the docs' });
    expect(link).toHaveStyle({ color: theme.palette.primary.main });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders a fenced code block with a themed background, distinct from inline code', () => {
    const { container } = renderPreview('Run:\n\n```\nnpm test\n```');
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveStyle({ backgroundColor: theme.palette.background.default });
  });

  it('does not render raw HTML (no rehype-raw pass-through)', () => {
    const { container } = renderPreview('Watch out <script>alert(1)</script> here.');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });
});

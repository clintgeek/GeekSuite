import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Typography, Link as MuiLink, alpha, useTheme } from '@mui/material';

/**
 * Narration — renders GM narration and player messages as markdown, styled
 * from the Arcane Codex palette instead of the plain-text `pre-wrap` block
 * this replaces (DOCS/TODO_ORDER.md #24: "**bold**" was showing literal
 * asterisks).
 *
 * Deliberately does NOT pass `rehype-raw`: react-markdown then treats any
 * literal HTML in the source as inert text rather than rendering it, which
 * is the sanitization contract here — no raw-HTML pass-through, no separate
 * sanitizer needed.
 *
 * `remark-breaks` keeps the paragraph/line-break feel of the plain-text
 * rendering it replaces: a single newline in AI prose used to render as a
 * line break under `white-space: pre-wrap`, but CommonMark treats a lone
 * newline as a soft break (a space). remark-breaks turns those back into
 * hard breaks so narration doesn't visually run together.
 */

// Fenced code (```), inline code (`) and bold (**/__) are the tokens whose
// *unclosed* form is jarring mid-stream: an open code fence swallows every
// following line into a code block, and a stray "**" prints literally. If a
// message is ever updated in place while still arriving (token-by-token),
// balancing these before they reach the parser keeps that from flashing raw.
// Today StoryPlay only ever sets a message once the full response is back,
// so on complete text every count is already even and this is a no-op —
// it's here so the component doesn't need rework if streaming lands later.
function balanceUnterminatedMarkdown(text) {
  if (!text) return text;
  let out = text;

  const fenceCount = (out.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) out += '\n```';

  const backtickCount = (out.match(/`/g) || []).length - (out.match(/```/g) || []).length * 3;
  if (backtickCount % 2 !== 0) out += '`';

  const boldStarCount = (out.match(/\*\*/g) || []).length;
  if (boldStarCount % 2 !== 0) out += '**';

  const boldUnderscoreCount = (out.match(/__/g) || []).length;
  if (boldUnderscoreCount % 2 !== 0) out += '__';

  return out;
}

// Markdown heading levels 1-6 all cap at the Typography `h4` size inside a
// message — narration is a chat bubble, not a document, so nothing in it
// should out-size the page's own heading (the story title is an h4). Levels
// still step down after that so a `# / ## / ###` hierarchy in AI output
// keeps some visual order rather than collapsing to one size.
const HEADING_VARIANT = { 1: 'h4', 2: 'h4', 3: 'h5', 4: 'h6', 5: 'h6', 6: 'h6' };

export default function Narration({ content, sx }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const inkGold = `color-mix(in srgb, ${theme.palette.text.primary} 65%, ${gold} 35%)`;

  const safeContent = useMemo(() => balanceUnterminatedMarkdown(content || ''), [content]);

  const components = useMemo(() => ({
    p: ({ children }) => (
      <Typography component="p" variant="body1" sx={{ m: 0, '&:not(:last-child)': { mb: 1.25 } }}>
        {children}
      </Typography>
    ),
    em: ({ children }) => (
      <Typography component="em" sx={{ fontFamily: '"Crimson Pro", serif', fontStyle: 'italic' }}>
        {children}
      </Typography>
    ),
    strong: ({ children }) => (
      <Typography component="strong" sx={{ fontWeight: 700, color: inkGold }}>
        {children}
      </Typography>
    ),
    blockquote: ({ children }) => (
      <Typography
        component="blockquote"
        sx={{
          m: 0,
          my: 1.25,
          pl: 1.75,
          borderLeft: `2px solid ${alpha(gold, 0.5)}`,
          color: 'text.secondary',
          fontStyle: 'italic',
        }}
      >
        {children}
      </Typography>
    ),
    ul: ({ children }) => (
      <Typography component="ul" sx={{ m: 0, mb: 1.25, pl: 2.5, '& li': { mb: 0.25 } }}>
        {children}
      </Typography>
    ),
    ol: ({ children }) => (
      <Typography component="ol" sx={{ m: 0, mb: 1.25, pl: 2.5, '& li': { mb: 0.25 } }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <Typography component="li" variant="body1" sx={{ lineHeight: 1.6 }}>
        {children}
      </Typography>
    ),
    code: ({ className, children }) => {
      // Fenced code carries a `language-xxx` className from remark-gfm/rehype;
      // plain inline code doesn't. That split is what tells them apart here.
      const isBlock = Boolean(className);
      return (
        <Typography
          component="code"
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: isBlock ? '0.85em' : '0.88em',
            ...(isBlock
              ? { display: 'block', whiteSpace: 'pre-wrap' }
              : {
                  bgcolor: alpha(gold, 0.12),
                  color: inkGold,
                  px: 0.5,
                  py: 0.125,
                  borderRadius: 0.75,
                }),
          }}
        >
          {children}
        </Typography>
      );
    },
    pre: ({ children }) => (
      <Typography
        component="pre"
        sx={{
          m: 0,
          mb: 1.25,
          p: 1.25,
          borderRadius: 1.5,
          overflow: 'auto',
          bgcolor: alpha(gold, 0.06),
          border: `1px solid ${alpha(gold, 0.15)}`,
        }}
      >
        {children}
      </Typography>
    ),
    a: ({ href, children }) => (
      <MuiLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: gold, textDecorationColor: alpha(gold, 0.4) }}
      >
        {children}
      </MuiLink>
    ),
    hr: () => (
      <Typography
        component="hr"
        sx={{ border: 'none', height: '1px', bgcolor: alpha(gold, 0.2), my: 1.5 }}
      />
    ),
    h1: ({ children }) => <HeadingTag level={1}>{children}</HeadingTag>,
    h2: ({ children }) => <HeadingTag level={2}>{children}</HeadingTag>,
    h3: ({ children }) => <HeadingTag level={3}>{children}</HeadingTag>,
    h4: ({ children }) => <HeadingTag level={4}>{children}</HeadingTag>,
    h5: ({ children }) => <HeadingTag level={5}>{children}</HeadingTag>,
    h6: ({ children }) => <HeadingTag level={6}>{children}</HeadingTag>,
  }), [gold, inkGold]);

  return (
    <Typography component="div" variant="body1" sx={sx}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {safeContent}
      </ReactMarkdown>
    </Typography>
  );
}

function HeadingTag({ level, children }) {
  return (
    <Typography
      component={`h${level}`}
      variant={HEADING_VARIANT[level]}
      sx={{ mt: 1.5, mb: 0.75, '&:first-of-type': { mt: 0 } }}
    >
      {children}
    </Typography>
  );
}

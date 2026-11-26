import { describe, it, expect } from 'vitest';
import { diagramNoteContent, diagramNoteTitle, backLinkLine } from '../../utils/sketchToText';
import { mermaidFence, mermaidLabels, diagramLabel } from '../../utils/mermaidText';

/**
 * The note "Turn into a diagram" saves (DOCS/HANDWRITING.md): built the way
 * every note made from handwriting is, with the diagram in a fence that
 * nothing in its source can close.
 */
describe('the diagram note', () => {
  const src = 'flowchart LR\n  a["Plan"] --> b["Do"]';

  it('is titled "Diagram: <handwritten title>"', () => {
    expect(diagramNoteTitle({ sketchTitle: 'Deploy flow' })).toBe('Diagram: Deploy flow');
    expect(diagramNoteTitle({ sketchTitle: '  ' })).toBe('Diagram: Untitled');
    expect(diagramNoteTitle({ sketchTitle: 'x'.repeat(600) })).toHaveLength(500);
  });

  it('opens with the standard back-link line, a blank line, then the fenced diagram', () => {
    const body = diagramNoteContent({ sketchId: 'abc', sketchTitle: 'Deploy flow', mermaid: `${src}\n\n` });
    expect(body).toBe(`${backLinkLine({ sketchId: 'abc', sketchTitle: 'Deploy flow' })}\n\n\`\`\`mermaid\n${src}\n\`\`\`\n`);
    expect(body.startsWith('From handwritten note: [Deploy flow](/notes/abc)\n\n')).toBe(true);
  });

  it('the fence is longer than any run of backticks in the source', () => {
    expect(mermaidFence('flowchart TD\n  a["x"]')).toMatch(/^```mermaid\n[\s\S]*\n```$/);
    expect(mermaidFence('flowchart TD\n  a["```"]')).toMatch(/^````mermaid\n[\s\S]*\n````$/);
    expect(mermaidFence('flowchart TD\n  a["`````"]')).toMatch(/^``````mermaid\n/);
  });
});

describe('a diagram\'s words (copied from the gateway)', () => {
  it('node and arrow labels in order, once each', () => {
    expect(mermaidLabels('flowchart TD\n  n1["Idea"] --> n2{"Good?"}\n  n2 -->|yes| n3("Build it")\n  n3 --> n1'))
      .toEqual(['Idea', 'Good?', 'yes', 'Build it']);
    expect(diagramLabel('flowchart TD\n  a --> b')).toBe('Diagram');
    expect(diagramLabel('flowchart TD\n  a["One"] --> b["Two"]')).toBe('Diagram: One, Two');
  });
});

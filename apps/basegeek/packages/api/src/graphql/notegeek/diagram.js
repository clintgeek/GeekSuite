/**
 * diagram.js — "turn this page into a Mermaid diagram"
 * (apps/notegeek/DOCS/HANDWRITING.md, "Turn into a diagram").
 *
 * Chef draws boxes and arrows by hand. This reads the page image and answers
 * with a Mermaid flowchart. Like transcribe.js it writes NOTHING: the client
 * shows the drawing for review and, if asked, saves it as a NEW Typed note
 * that links back. Unlike transcribeSketch it never keeps what it read as the
 * page's transcript: a diagram is not the page's searchable words.
 *
 * One automatic retry: when the answer fails `checkMermaid`, the model is
 * asked once more with the problem named. A second failure is an error. The
 * client's own `mermaid.parse` is the real check; when that fails it sends
 * `previous` + `problem`, which is one repair call and nothing else.
 *
 * Failures are errors, never an empty diagram, with the same codes and
 * daily-ceiling behaviour as transcribe.js (whose helpers are reused), plus
 * AI_NOT_A_DIAGRAM ("[no diagram]") and AI_BAD_DIAGRAM (still not valid).
 */

import { runAIFeature } from '../../services/aiFeatureRunner.js';
import defaultAi from '../../services/aiService.js';
import { dailyBudgetSpent, stripOuterFence, transcribeError } from './transcribe.js';
import { checkMermaid } from './mermaidCheck.js';

/**
 * `vision` because the input is an image (it filters to rows that accept one).
 * `code` because the answer is Mermaid source, not prose and not JSON:
 * `structured` would filter to rows that do JSON mode, which says nothing
 * about writing a flowchart; `code` is recorded and does not filter
 * (DOCS/AIGEEK_CAPABILITY_ROUTING.md §3.1, §7.9). `balanced`: Chef is
 * watching a spinner, but a misread box costs more than a second.
 */
export const DIAGRAM_NEED = 'vision+code:balanced';

/** A runaway bound, not a ration (the money ceiling is the one limit). Each page is one or two calls. */
export const DIAGRAM_DAILY_CAP = 400;
export const DIAGRAM_TIMEOUT_MS = 45000;
/** 150 nodes at ~12 tokens a line, with room. */
export const DIAGRAM_MAX_TOKENS = 2500;

/** What a page with no diagram on it answers. */
export const NO_DIAGRAM = '[no diagram]';

export const DIAGRAM_PROMPT = `You are turning a hand-drawn diagram (boxes, circles and arrows drawn with a stylus) into a Mermaid flowchart. Your only job is to write, as Mermaid source, the diagram that is drawn on the page.

Rules:
1. FLOWCHART ONLY. The first line is exactly "flowchart TD" (top to bottom) or "flowchart LR" (left to right), whichever matches how the page is laid out.
2. ONE NODE PER DRAWN SHAPE. Give each node a short id (n1, n2, n3 ...) and its label in double quotes, exactly as written on the page: the writer's own words, spelling, abbreviations, numbers and capitals. Never invent, summarise, translate, correct or tidy a label. Words written in a shape on several lines are one label.
3. SHAPES. A box is n1["label"], a rounded box or oval n1("label"), a circle n1(("label")), a diamond n1{"label"}. Any other shape is a box.
4. ARROWS. Each drawn arrow is one line: n1 --> n2. Words written on or beside an arrow are its label: n1 -->|text| n2. A line with no arrowhead is n1 --- n2; an arrow with a head at each end is n1 <--> n2.
5. MARK WHAT YOU CANNOT READ. Write [?] for each word you cannot read with confidence. Never guess a word and present it as read.
6. LABELS ARE PLAIN WORDS. A label never contains a double quote (write ' instead) or a | character.
7. NOTHING BUT THE DIAGRAM. No styling (style, classDef, class, linkStyle), no click or links, no %%{init}%% or any other directive, no comments, no HTML, no Markdown, no code fence, and nothing before or after the diagram.
8. If the page has no diagram (only writing, or nothing at all), reply with exactly "${NO_DIAGRAM}".`;

/** What the page is, when it is not a plain stylus page. */
const SOURCE_NOTE = {
  photo: 'The page is a photograph of a paper notebook page. Ignore ruled lines, the paper, shadows, the background and anything printed on the notebook.',
  form: 'The page is a printed form with handwriting on it. The form\'s own print is not part of the diagram; use only what the writer drew and wrote.',
};

/** The system prompt for a page, by where it came from. */
export const diagramPromptFor = (source) => (SOURCE_NOTE[source] ? `${DIAGRAM_PROMPT}\n9. ${SOURCE_NOTE[source]}` : DIAGRAM_PROMPT);

const ASK = 'Turn the diagram on this page into a Mermaid flowchart.';
const fixRequest = (problem) => `That diagram has a problem: ${problem}. Answer again with the whole corrected diagram, following every rule, and nothing else.`;

/** One model call. Returns the answer text, or throws the right error. */
async function ask({ messages, userId, ai, dailyCap }) {
  const result = await runAIFeature({
    app: 'notegeek',
    feature: 'diagram',
    userId,
    messages,
    need: DIAGRAM_NEED,
    maxCallsPerDay: dailyCap,
    timeoutMs: DIAGRAM_TIMEOUT_MS,
    maxTokens: DIAGRAM_MAX_TOKENS,
    // Reading, not writing: nothing here wants variety.
    temperature: 0,
    // Never shown. A fallback path always throws below.
    fallback: () => '',
    ...(ai ? { ai } : {}),
  });
  const prov = result.provenance || {};
  if (prov.source !== 'model') {
    if (prov.reason === 'cap') {
      throw transcribeError(
        `That is today's ${DIAGRAM_DAILY_CAP} diagram requests used. It resets at midnight UTC.`,
        'AI_CAP',
        { cap: DIAGRAM_DAILY_CAP }
      );
    }
    if (prov.reason === 'empty') {
      throw transcribeError('The model sent nothing back for that page. Try again.', 'AI_EMPTY');
    }
    if (await dailyBudgetSpent(ai || defaultAi)) {
      throw transcribeError(
        "Today's AI spending limit is used up, so diagrams can't be made. It resets at midnight UTC.",
        'AI_BUDGET'
      );
    }
    throw transcribeError(
      'Diagrams are unavailable right now. Your handwriting is unchanged; try again in a minute.',
      'AI_UNAVAILABLE',
      { reason: prov.reason || null }
    );
  }
  const text = stripOuterFence(typeof result.data === 'string' ? result.data : '').trim();
  if (!text) throw transcribeError('The model sent nothing back for that page. Try again.', 'AI_EMPTY');
  if (text.toLowerCase() === NO_DIAGRAM) {
    throw transcribeError(
      "This page doesn't look like a diagram. Boxes and arrows work best.",
      'AI_NOT_A_DIAGRAM'
    );
  }
  return { text, provenance: prov };
}

const badDiagram = (problem, model) => transcribeError(
  `The model's diagram could not be used (${problem}). Try again.`,
  'AI_BAD_DIAGRAM',
  { model: model || null }
);

/**
 * Turn a page into a Mermaid flowchart.
 *
 * @param {object} opts
 * @param {string} opts.image      base64, no data: prefix (validated)
 * @param {string} opts.mediaType  image/png or image/jpeg (validated)
 * @param {'sketch'|'photo'|'form'} [opts.source]
 * @param {string} [opts.previous] a diagram the client could not draw ...
 * @param {string} [opts.problem]  ... and why: one repair call, nothing else
 * @param {string} opts.userId
 * @param {object} [opts.ai]       injectable aiService, for tests
 * @param {number} [opts.dailyCap] the runaway bound (tests lower it)
 * @returns {Promise<{ mermaid: string, provenance: object, repaired: boolean }>}
 *   `repaired` is true when the answer is a corrected second attempt.
 */
export async function diagramSketch({
  image, mediaType, source = 'sketch', previous = null, problem = null, userId,
  ai = undefined, dailyCap = DIAGRAM_DAILY_CAP,
}) {
  const opening = [
    { role: 'system', content: diagramPromptFor(source) },
    { role: 'user', content: [{ type: 'text', text: ASK }, { type: 'image', mediaType, data: image }] },
  ];
  const repairOf = (answer, why) => [
    ...opening,
    { role: 'assistant', content: answer },
    { role: 'user', content: fixRequest(why) },
  ];

  // The client's mermaid.parse failed: one repair call, and that is all.
  if (previous && problem) {
    const fixed = await ask({ messages: repairOf(previous, problem), userId, ai, dailyCap });
    const verdict = checkMermaid(fixed.text);
    if (!verdict.ok) throw badDiagram(verdict.problem, fixed.provenance.model);
    return { mermaid: fixed.text, provenance: fixed.provenance, repaired: true };
  }

  const first = await ask({ messages: opening, userId, ai, dailyCap });
  const verdict = checkMermaid(first.text);
  if (verdict.ok) return { mermaid: first.text, provenance: first.provenance, repaired: false };

  // One automatic retry, with the problem named.
  const second = await ask({ messages: repairOf(first.text, verdict.problem), userId, ai, dailyCap });
  const again = checkMermaid(second.text);
  if (!again.ok) throw badDiagram(again.problem, second.provenance.model);
  return { mermaid: second.text, provenance: second.provenance, repaired: true };
}

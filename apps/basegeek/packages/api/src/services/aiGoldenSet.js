/**
 * aiGoldenSet — six questions with known answers, scored by code.
 *
 * The problem this exists for (DOCS/AIGEEK_CAPABILITY_ROUTING.md §3.2): the
 * catalog can tell you a model emits JSON and nothing else. `fitness:
 * 'structured'` is a shape test, so on 2026-09-16 twenty-two rows tied for
 * `structured:fast`, the resolver fell to its last tie-break, and
 * `groq/allam-2-7b` won — a model that answered a plain English prompt in
 * Arabic and offered "0 to 1000 calories" as its uncertainty about a plate of
 * pancakes. Nothing was broken. Nothing measured whether a model is any *good*.
 *
 * The binding constraint is that every answer must be checkable by code — no
 * human, no judge model, no opinion. That rules out "is this prose good?" and
 * rules in anything with a verifiable answer. Six questions, each scoring 0..1:
 *
 *   extract      structured   messy sentence -> exact JSON with the right values
 *   refusal      structured   a field it cannot know -> null, not a fabrication
 *   numeracy     numeracy     arithmetic with one right answer
 *   calibration  calibration  a real-world estimate that must land in a band
 *   instruction  instruction  two explicit constraints, checked by regex
 *   reasoning    reasoning    short multi-step, one verifiable number
 *
 * `refusal` is the most valuable of the six for this suite. Hallucinated values
 * are the failure that actually hurt: a model that invented `pancake mix` from a
 * query that never said "mix", and another that answered `"low_calories": false`.
 * A model that fabricates should lose the structured class however fast it is.
 *
 * `calibration` is literally the judge's job, and is what separates the model
 * that says 570 from the one that says 1,200 with 200g of carbs.
 *
 * ── The language check, which the design doc did not have ───────────────────
 *
 * Every consumer in this suite prompts in English. A model that replies in
 * another script has not answered the question, however well-formed the reply,
 * and that is mechanically checkable — so it is applied to every question
 * rather than being a seventh one. This is the exact failure that made
 * `allam-2-7b` unusable, and no amount of JSON-shape testing would have caught
 * it.
 *
 * Scores are a mean, not a gate. A model that fails `refusal` is not banned; it
 * ranks below one that passes, which is the same philosophy as `fitness` —
 * nothing is excluded for being weak, it is ranked.
 */

/** Longest answer any question needs. Enough to answer, not enough to ramble. */
export const GOLDEN_MAX_TOKENS = 120;

/** Share of letters that must be Latin for an answer to count as English. */
export const LATIN_RATIO_MIN = 0.9;

/* ───────────────────────────── scoring helpers ──────────────────────────── */

/**
 * Is this answer written in the script we asked in?
 *
 * Counts letters only, so digits, punctuation and JSON syntax do not dilute the
 * measure. An answer with no letters at all (a bare number, which three of the
 * six questions ask for) passes — there is nothing to be in the wrong script.
 */
export function isLatinScript(text) {
  const letters = String(text ?? '').match(/\p{L}/gu) || [];
  if (letters.length === 0) return true;
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  return latin / letters.length >= LATIN_RATIO_MIN;
}

/** The first JSON object in a reply, or null. Models fence and preamble. */
export function firstJsonObject(text) {
  const raw = String(text ?? '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The first number in a reply, ignoring thousands separators. */
export function firstNumber(text) {
  const match = String(text ?? '').replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Sentence count, by terminal punctuation. */
export function sentenceCount(text) {
  return (String(text ?? '').match(/[^.!?]+[.!?]/g) || []).length;
}

/* ──────────────────────────────── the six ───────────────────────────────── */

export const GOLDEN_SET = Object.freeze([
  {
    id: 'extract',
    className: 'structured',
    system: 'Reply with JSON only.',
    user:
      'Extract the task from: "Call the vet Friday at 3pm #flock". '
      + 'Return {"task": string, "day": string, "time": string, "tag": string}.',
    /** Shape is a quarter of it; the values are the rest. */
    score(text) {
      const obj = firstJsonObject(text);
      if (!obj) return 0;
      let points = 0.25;
      const str = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
      if (/vet/.test(str(obj.task))) points += 0.25;
      if (/fri/.test(str(obj.day))) points += 0.25;
      if (/3\s*(pm|p\.m)|15:00/.test(str(obj.time))) points += 0.25;
      return points;
    }
  },
  {
    id: 'refusal',
    className: 'structured',
    system: 'Reply with JSON only. Use null for anything the text does not state.',
    user:
      'Extract from: "Lunch with Sam on Tuesday". '
      + 'Return {"person": string, "day": string, "phone": string or null}.',
    /**
     * The point is `phone`. The text cannot support it, so null is the correct
     * answer and any confident string is a fabrication — the failure mode that
     * actually costs users trust.
     */
    score(text) {
      const obj = firstJsonObject(text);
      if (!obj) return 0;
      let points = 0.2;
      if (typeof obj.person === 'string' && /sam/i.test(obj.person)) points += 0.2;
      if (typeof obj.day === 'string' && /tue/i.test(obj.day)) points += 0.1;
      // Half the marks for the one thing being measured.
      const phone = obj.phone;
      const refused = phone === null || phone === undefined || phone === ''
        || (typeof phone === 'string' && /^(null|none|n\/a|unknown)$/i.test(phone.trim()));
      if (refused) points += 0.5;
      return points;
    }
  },
  {
    id: 'numeracy',
    className: 'numeracy',
    system: 'Answer with only a number.',
    user: 'A recipe serves 4 and totals 1200 calories. How many calories are in 1.5 servings?',
    score(text) {
      return firstNumber(text) === 450 ? 1 : 0;
    }
  },
  {
    id: 'calibration',
    className: 'calibration',
    system: 'Answer with only a number.',
    user: 'Roughly how many calories are in two slices of pepperoni pizza?',
    /**
     * A band, not a value. This is the judge's job in miniature: the point is
     * not precision, it is not being wrong by an order of magnitude. Partial
     * credit for the near-miss band keeps the signal graded rather than binary.
     */
    score(text) {
      const n = firstNumber(text);
      if (n === null) return 0;
      if (n >= 400 && n <= 800) return 1;
      if (n >= 250 && n <= 1200) return 0.5;
      return 0;
    }
  },
  {
    id: 'instruction',
    className: 'instruction',
    system: 'Follow the constraints exactly.',
    user: 'Write exactly three sentences about rain. Do not use the letter e anywhere.',
    /**
     * Two constraints, scored separately so the question discriminates instead
     * of being all-or-nothing — most models miss the letter rule and the count
     * still tells us something.
     */
    score(text) {
      let points = 0;
      if (sentenceCount(text) === 3) points += 0.5;
      if (!/e/i.test(String(text ?? ''))) points += 0.5;
      return points;
    }
  },
  {
    id: 'reasoning',
    className: 'reasoning',
    system: 'Answer with only a number.',
    user: 'A shelf holds 12 books. You remove a third of them, then add 5. How many books are on the shelf?',
    score(text) {
      return firstNumber(text) === 13 ? 1 : 0;
    }
  }
]);

/** The distinct classes, in the order they appear. */
export const GOLDEN_CLASSES = Object.freeze(
  [...new Set(GOLDEN_SET.map((q) => q.className))]
);

/* ──────────────────────────────── scoring ───────────────────────────────── */

/**
 * How many of the six must come back for a run to count as a measurement.
 *
 * Below this the run is inconclusive — a provider having a bad minute, not a
 * model being bad — and must not overwrite a score earned when the provider was
 * healthy.
 */
export const GOLDEN_MIN_ANSWERED = 4;

/** Did enough questions come back to trust this run? */
export function isConclusive(rolled) {
  return !!rolled && typeof rolled.score === 'number' && rolled.answered >= GOLDEN_MIN_ANSWERED;
}

/**
 * Score one answer to one question.
 *
 * A reply in the wrong script scores zero whatever it says: the model did not
 * answer the question that was asked, and every consumer here prompts in
 * English.
 *
 * @param {object} question  one of GOLDEN_SET
 * @param {string} text      the model's raw reply
 * @returns {{id, className, score, offLanguage}}
 */
export function scoreAnswer(question, text) {
  const offLanguage = !isLatinScript(text);
  return {
    id: question.id,
    className: question.className,
    score: offLanguage ? 0 : Math.max(0, Math.min(1, question.score(text))),
    offLanguage
  };
}

/**
 * Roll per-question scores into a row's quality block.
 *
 * `byClass` is a mean per class, so a model good at extraction and bad at
 * arithmetic reads as exactly that rather than averaging into "medium". The
 * overall `score` is the mean of the CLASS means rather than of the questions,
 * so a class with two questions does not count double.
 *
 * @param {Array<{id, className, score, offLanguage}>} answers
 */
export function rollUp(answers = []) {
  // An answer that never arrived is NOT a wrong answer. A 429 or a timeout
  // says nothing about the model's ability, and scoring it zero is how a
  // perfectly good model gets branded bad: on 2026-09-16 `gemini-3.1-flash-lite`
  // scored 1.0 in one run and 0.2 minutes later, purely because its free tier
  // rate-limited four of the six questions the second time.
  const errored = answers.filter((a) => a && a.errored).length;
  const scored = answers.filter((a) => a && !a.errored && typeof a.score === 'number');
  if (scored.length === 0) {
    return { score: null, byClass: {}, offLanguage: false, answered: 0, errored };
  }

  const byClass = {};
  for (const className of new Set(scored.map((a) => a.className))) {
    const inClass = scored.filter((a) => a.className === className);
    byClass[className] = round2(inClass.reduce((sum, a) => sum + a.score, 0) / inClass.length);
  }
  const classMeans = Object.values(byClass);
  return {
    score: round2(classMeans.reduce((sum, v) => sum + v, 0) / classMeans.length),
    byClass,
    // Recorded, because a model answering in the wrong script is a fact worth
    // seeing in the console rather than just a low number.
    offLanguage: scored.some((a) => a.offLanguage),
    answered: scored.length,
    errored
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

export default { GOLDEN_SET, GOLDEN_CLASSES, scoreAnswer, rollUp, isLatinScript, isConclusive };

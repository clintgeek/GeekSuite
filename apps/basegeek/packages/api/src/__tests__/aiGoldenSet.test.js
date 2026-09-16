/**
 * aiGoldenSet — the questions, and what a real answer scores.
 *
 * These exist because the catalog could tell you a model emits JSON and nothing
 * else. On 2026-09-16 that let 22 rows tie for `structured:fast` and the
 * tie-break handed the work to `groq/allam-2-7b`, which answered a plain
 * English prompt in Arabic. Several cases below use that model's actual replies.
 *
 * Every scorer is pure and offline: no network, no judge model, no opinion.
 */
import { describe, it, expect } from '@jest/globals';

const {
  GOLDEN_SET, GOLDEN_CLASSES, scoreAnswer, rollUp,
  isLatinScript, firstJsonObject, firstNumber, sentenceCount, LATIN_RATIO_MIN,
  isConclusive, GOLDEN_MIN_ANSWERED
} = await import('../services/aiGoldenSet.js');

const q = (id) => GOLDEN_SET.find((x) => x.id === id);
const scoreOf = (id, text) => scoreAnswer(q(id), text).score;

describe('the set itself', () => {
  it('asks six questions across five classes', () => {
    expect(GOLDEN_SET).toHaveLength(6);
    expect(GOLDEN_CLASSES).toEqual(['structured', 'numeracy', 'calibration', 'instruction', 'reasoning']);
  });

  it('gives every question a system line, a user line and a scorer', () => {
    for (const question of GOLDEN_SET) {
      expect(typeof question.system).toBe('string');
      expect(typeof question.user).toBe('string');
      expect(typeof question.score).toBe('function');
    }
  });

  it('keeps the questions free of anything a model could have memorised about us', () => {
    // They go to third-party providers on every run. Nothing user-derived.
    const all = GOLDEN_SET.map((x) => `${x.system} ${x.user}`).join(' ');
    expect(all).not.toMatch(/clintgeek|chef|@|password|key/i);
  });
});

describe('the language check — the failure that started this', () => {
  it('reads a wrong-script answer as not an answer', () => {
    // allam-2-7b's actual reply to "say ok", 2026-09-16.
    const arabic = 'OK, فهمت. يمكنني مساعدتك الآن. كيف يمكنني أن أقدم لك المعلومات أو المساعدة التي تحتاجها؟';
    expect(isLatinScript(arabic)).toBe(false);
  });

  it('scores a wrong-script answer zero however well-formed it is', () => {
    // Correct JSON, correct values, wrong language. Still zero: the model did
    // not answer the question every consumer in this suite actually asks.
    const rightButArabic = '{"task": "اتصل بالطبيب البيطري", "day": "الجمعة", "time": "3pm", "tag": "flock"}';
    const result = scoreAnswer(q('extract'), rightButArabic);
    expect(result.offLanguage).toBe(true);
    expect(result.score).toBe(0);
  });

  it('does not punish an answer with no letters at all', () => {
    // Three of the six questions ask for a bare number.
    expect(isLatinScript('450')).toBe(true);
    expect(scoreOf('numeracy', '450')).toBe(1);
  });

  it('tolerates an accent or a stray symbol', () => {
    expect(isLatinScript('Café au lait, naïve résumé')).toBe(true);
    expect(LATIN_RATIO_MIN).toBeLessThan(1);
  });
});

describe('extract — shape is a quarter of it', () => {
  it('gives full marks for the right values', () => {
    expect(scoreOf('extract', '{"task":"Call the vet","day":"Friday","time":"3pm","tag":"flock"}')).toBe(1);
  });

  it('gives a quarter to valid JSON that got everything wrong', () => {
    // The old fitness test passed this. That is the gap.
    expect(scoreOf('extract', '{"task":"x","day":"y","time":"z","tag":"w"}')).toBe(0.25);
  });

  it('reads through a code fence and a preamble', () => {
    const fenced = 'Sure! Here you go:\n```json\n{"task":"Call the vet","day":"Friday","time":"15:00","tag":"flock"}\n```';
    expect(scoreOf('extract', fenced)).toBe(1);
  });

  it('scores prose zero', () => {
    expect(scoreOf('extract', 'You need to call the vet on Friday at 3pm.')).toBe(0);
  });
});

describe('refusal — the most valuable question here', () => {
  it('rewards null for the field the text cannot support', () => {
    expect(scoreOf('refusal', '{"person":"Sam","day":"Tuesday","phone":null}')).toBe(1);
  });

  it('takes half the marks off for inventing a phone number', () => {
    // Hallucinated values are the failure that actually hurt: `pancake mix`
    // from a query that never said mix.
    const invented = '{"person":"Sam","day":"Tuesday","phone":"555-0142"}';
    expect(scoreOf('refusal', invented)).toBe(0.5);
    expect(scoreOf('refusal', invented)).toBeLessThan(scoreOf('refusal', '{"person":"Sam","day":"Tuesday","phone":null}'));
  });

  it('accepts the words models use for "I do not know"', () => {
    for (const spelling of ['null', 'N/A', 'unknown', 'none', '']) {
      const text = `{"person":"Sam","day":"Tuesday","phone":${JSON.stringify(spelling)}}`;
      expect(scoreOf('refusal', text)).toBe(1);
    }
  });
});

describe('numeracy and reasoning are exact', () => {
  it('accepts the right number in any reasonable wrapping', () => {
    expect(scoreOf('numeracy', '450')).toBe(1);
    expect(scoreOf('numeracy', 'The answer is 450 calories.')).toBe(1);
    expect(scoreOf('numeracy', '1,200 / 4 = 300, so 450')).toBe(0);  // first number wins, deliberately
  });

  it('rejects a near miss, because arithmetic has one answer', () => {
    expect(scoreOf('numeracy', '400')).toBe(0);
    expect(scoreOf('numeracy', '1800')).toBe(0);
  });

  it('scores the multi-step question', () => {
    expect(scoreOf('reasoning', '13')).toBe(1);
    expect(scoreOf('reasoning', '12')).toBe(0);   // forgot the +5
    expect(scoreOf('reasoning', '9')).toBe(0);    // removed a third of the wrong thing
  });
});

describe('calibration — a band, not a value', () => {
  it('gives full marks inside the band', () => {
    for (const n of [400, 550, 620, 800]) expect(scoreOf('calibration', String(n))).toBe(1);
  });

  it('gives half marks for plausible-but-off', () => {
    expect(scoreOf('calibration', '300')).toBe(0.5);
    expect(scoreOf('calibration', '1100')).toBe(0.5);
  });

  it('gives nothing for an order-of-magnitude miss', () => {
    // This is what the judge exists to catch.
    expect(scoreOf('calibration', '45')).toBe(0);
    expect(scoreOf('calibration', '13800')).toBe(0);
  });
});

describe('instruction — two constraints, scored separately', () => {
  it('gives full marks for three sentences with no e', () => {
    expect(scoreOf('instruction', 'Rain falls. Wind blows hard. All is dark now.')).toBe(1);
  });

  it('gives half for the right count and a stray e', () => {
    expect(scoreOf('instruction', 'Rain falls. The wind blows. All is dark.')).toBe(0.5);
  });

  it('gives half for no e but the wrong count', () => {
    expect(scoreOf('instruction', 'Rain falls hard.')).toBe(0.5);
  });

  it('discriminates rather than failing everyone', () => {
    // A question every model fails carries no signal, which is why this one is
    // graded instead of all-or-nothing.
    expect(scoreOf('instruction', 'It rains. The sky is grey. People hurry home.')).toBeGreaterThan(0);
  });
});

describe('rollUp', () => {
  const answer = (id, className, score, offLanguage = false) => ({ id, className, score, offLanguage });

  it('means each class, then means the classes', () => {
    // structured has two questions; it must not count double.
    const rolled = rollUp([
      answer('extract', 'structured', 1),
      answer('refusal', 'structured', 0),
      answer('numeracy', 'numeracy', 1)
    ]);
    expect(rolled.byClass).toEqual({ structured: 0.5, numeracy: 1 });
    expect(rolled.score).toBe(0.75);
  });

  it('reports a wrong-script run as such, not merely as a low score', () => {
    const rolled = rollUp([answer('extract', 'structured', 0, true)]);
    expect(rolled.offLanguage).toBe(true);
    expect(rolled.score).toBe(0);
  });

  it('says nothing rather than zero when a row was never asked', () => {
    // null is "unmeasured"; 0 is "measured and bad". The resolver must be able
    // to tell them apart or an unscored model could never be picked.
    expect(rollUp([]).score).toBeNull();
    expect(rollUp().score).toBeNull();
  });

  it('counts how many questions actually came back', () => {
    expect(rollUp([answer('a', 'structured', 1), answer('b', 'numeracy', 1)]).answered).toBe(2);
  });
});

describe('the parsing helpers', () => {
  it('finds the first object through fences and chatter', () => {
    expect(firstJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(firstJsonObject('Here: {"a":1} — hope that helps')).toEqual({ a: 1 });
    expect(firstJsonObject('[1,2,3]')).toBeNull();      // an array is not the shape asked for
    expect(firstJsonObject('nope')).toBeNull();
    expect(firstJsonObject('{broken')).toBeNull();
  });

  it('reads a number through thousands separators', () => {
    expect(firstNumber('1,200')).toBe(1200);
    expect(firstNumber('about 450 calories')).toBe(450);
    expect(firstNumber('-3.5')).toBe(-3.5);
    expect(firstNumber('none')).toBeNull();
  });

  it('counts sentences by terminal punctuation', () => {
    expect(sentenceCount('One. Two! Three?')).toBe(3);
    expect(sentenceCount('No terminator here')).toBe(0);
  });
});

/**
 * An answer that never arrived is not a wrong answer.
 *
 * Found live on 2026-09-16: `gemini-3.1-flash-lite` scored 1.0 in one run and
 * 0.2 minutes later, from the same six questions. Nothing about the model had
 * changed — its free tier rate-limited four of the six the second time, and
 * those were being scored as zeros. A rate limit says nothing about ability,
 * and this is the same unmeasured-versus-bad distinction the resolver makes
 * everywhere else, one level down.
 */
describe('errored questions are excluded, not zeroed', () => {
  const ok = (id, className, score) => ({ id, className, score, offLanguage: false });
  const failed = (id, className) => ({ id, className, score: null, errored: true });

  it('does not let a rate limit drag the mean down', () => {
    const rolled = rollUp([
      ok('extract', 'structured', 1),
      ok('refusal', 'structured', 1),
      failed('numeracy', 'numeracy'),
      failed('calibration', 'calibration'),
    ]);
    // Two perfect answers and two that never came back is a 1.0, not a 0.5.
    expect(rolled.score).toBe(1);
    expect(rolled.answered).toBe(2);
    expect(rolled.errored).toBe(2);
  });

  it('reports nothing measurable when every question errored', () => {
    const rolled = rollUp([failed('extract', 'structured'), failed('numeracy', 'numeracy')]);
    expect(rolled.score).toBeNull();
    expect(rolled.errored).toBe(2);
  });

  it('calls a run conclusive only when enough came back', () => {
    const answered = (n) => rollUp(
      Array.from({ length: n }, (_, i) => ok(`q${i}`, 'structured', 1))
        .concat(Array.from({ length: 6 - n }, (_, i) => failed(`e${i}`, 'structured')))
    );
    expect(isConclusive(answered(6))).toBe(true);
    expect(isConclusive(answered(4))).toBe(true);
    expect(isConclusive(answered(3))).toBe(false);
    expect(isConclusive(answered(0))).toBe(false);
    expect(GOLDEN_MIN_ANSWERED).toBe(4);
  });

  it('still counts a genuine zero as a zero', () => {
    // The distinction is "did not answer" vs "answered wrongly" — a wrong
    // answer must keep costing the model its marks.
    const rolled = rollUp([ok('numeracy', 'numeracy', 0), ok('extract', 'structured', 1)]);
    expect(rolled.score).toBe(0.5);
    expect(rolled.errored).toBe(0);
  });
});

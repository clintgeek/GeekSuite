// morningBrief.test.js — the three gates in front of the morning brief.
//
// Night 2, stream R118 (AI_IDEAS.md #5). The brief is display-only and easy to
// get wrong in exactly one direction: showing up when it shouldn't. It has to
// stay off unless the person opted in, it's after 5 a.m. local, they're signed
// in, and they haven't already waved it away today.
//
// startgeek has no component runner, so the decision lives in a pure module
// (same reasoning as `csrfHeal.js` and `commandFailure.js`) and this runs on
// plain node:test.
//
// Run with: node --test apps/startgeek/src/lib/morningBrief.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  BRIEF_DISMISS_KEY,
  BRIEF_MIN_LOCAL_HOUR,
  isBriefHour,
  isDismissedFor,
  localDayIso,
  provenanceLine,
  readDismissedDate,
  shouldRequestBrief,
  writeDismissedDate,
} from './morningBrief.js'

/** A localStorage stand-in. `throws: true` is a browser with site data blocked. */
const fakeStorage = (initial = {}, { throws = false } = {}) => {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key) {
      if (throws) throw new Error('storage disabled')
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      if (throws) throw new Error('storage disabled')
      map.set(key, String(value))
    },
    _map: map,
  }
}

const at = (iso) => new Date(iso)

describe('localDayIso', () => {
  test('reads the local calendar, not UTC', () => {
    // 23:30 local on the 6th is the 7th in UTC anywhere west of the meridian.
    // Constructed from local fields so this holds in whatever zone it runs in.
    const late = new Date(2026, 8, 6, 23, 30, 0)
    assert.equal(localDayIso(late), '2026-09-06')
  })

  test('pads a single-digit month and day', () => {
    assert.equal(localDayIso(new Date(2026, 0, 5, 9, 0, 0)), '2026-01-05')
  })
})

describe('isBriefHour', () => {
  test(`the gate opens at ${BRIEF_MIN_LOCAL_HOUR} and stays open all day`, () => {
    assert.equal(isBriefHour(BRIEF_MIN_LOCAL_HOUR - 1), false)
    assert.equal(isBriefHour(BRIEF_MIN_LOCAL_HOUR), true)
    assert.equal(isBriefHour(23), true)
  })

  test('nonsense is not an hour', () => {
    assert.equal(isBriefHour(24), false)
    assert.equal(isBriefHour(-1), false)
    assert.equal(isBriefHour(7.5), false)
    assert.equal(isBriefHour(null), false)
    assert.equal(isBriefHour('7'), false)
  })
})

describe('the dismissal memory', () => {
  test('a dismissal is remembered for that day only', () => {
    const store = fakeStorage()
    writeDismissedDate('2026-09-06', store)
    assert.equal(readDismissedDate(store), '2026-09-06')
    assert.equal(isDismissedFor('2026-09-06', store), true)
    assert.equal(isDismissedFor('2026-09-07', store), false)
  })

  test('a junk value is not a dismissal', () => {
    assert.equal(readDismissedDate(fakeStorage({ [BRIEF_DISMISS_KEY]: 'yes' })), null)
    assert.equal(readDismissedDate(fakeStorage({ [BRIEF_DISMISS_KEY]: '' })), null)
    assert.equal(readDismissedDate(fakeStorage()), null)
  })

  test('storage that throws means "not dismissed", never a broken console', () => {
    const store = fakeStorage({}, { throws: true })
    assert.equal(readDismissedDate(store), null)
    assert.doesNotThrow(() => writeDismissedDate('2026-09-06', store))
    assert.equal(isDismissedFor('2026-09-06', store), false)
  })
})

describe('shouldRequestBrief', () => {
  const morning = at(new Date(2026, 8, 6, 7, 15, 0).toISOString())
  const base = { enabled: true, signedIn: true, now: morning, storage: fakeStorage() }

  test('all three gates open', () => {
    assert.equal(shouldRequestBrief(base), true)
  })

  test('opt-in is off by default, and off means the query is never made', () => {
    assert.equal(shouldRequestBrief({ ...base, enabled: false }), false)
    assert.equal(shouldRequestBrief(), false)
  })

  test('signed out there is nothing personal to brief on', () => {
    assert.equal(shouldRequestBrief({ ...base, signedIn: false }), false)
  })

  test('before 5 a.m. it is not morning yet', () => {
    assert.equal(shouldRequestBrief({ ...base, now: new Date(2026, 8, 6, 4, 59, 0) }), false)
    assert.equal(shouldRequestBrief({ ...base, now: new Date(2026, 8, 6, 5, 0, 0) }), true)
  })

  test('dismissed today stays dismissed; tomorrow is a new day', () => {
    const storage = fakeStorage()
    writeDismissedDate(localDayIso(morning), storage)
    assert.equal(shouldRequestBrief({ ...base, storage }), false)
    assert.equal(
      shouldRequestBrief({ ...base, storage, now: new Date(2026, 8, 7, 7, 15, 0) }),
      true
    )
  })
})

describe('provenanceLine', () => {
  test('a model answer names the model', () => {
    assert.equal(
      provenanceLine({ source: 'model', model: 'llama-3.3-70b-versatile' }),
      'brief by llama-3.3-70b-versatile'
    )
  })

  test('a fallback never passes for a model answer', () => {
    assert.equal(provenanceLine({ source: 'fallback', reason: 'cap', model: null }), 'no model today')
    // a source the server did not fill in, and a model name it did not send
    assert.equal(provenanceLine({ source: 'model', model: null }), 'no model today')
    assert.equal(provenanceLine(null), 'no model today')
    assert.equal(provenanceLine(undefined), 'no model today')
  })
})

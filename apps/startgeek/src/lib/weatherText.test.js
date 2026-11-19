import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sentenceCase, weatherStats, STAT_SEPARATOR } from './weatherText.js'
import { formatIsoTime } from './time.js'

test('the stat line is plain words with a separator between every stat', () => {
  const line = weatherStats({ high: 78, low: 60, humidity: 55, windSpeed: 6 }).join(STAT_SEPARATOR)
  assert.equal(line, 'H 78 · L 60 · 55% humidity · wind 6 mph')
  assert.doesNotMatch(line, /\bRH\b|\bW \d/)
})

test('missing stats are left out, not shown as gaps', () => {
  assert.deepEqual(weatherStats({ humidity: 40 }), ['40% humidity'])
  assert.deepEqual(weatherStats({}), [])
})

test('conditions read in one case everywhere', () => {
  assert.equal(sentenceCase('Mainly Clear'), 'Mainly clear')
  assert.equal(sentenceCase('mainly clear'), 'Mainly clear')
  assert.equal(sentenceCase(''), '')
})

test('sunrise and sunset follow the clock setting', () => {
  const sunset = '2026-09-05T19:20:00'
  assert.equal(formatIsoTime(sunset, true), '7:20pm')
  assert.equal(formatIsoTime(sunset, false), '19:20')
  assert.equal(formatIsoTime('2026-09-05T06:05:00', true), '6:05am')
  assert.equal(formatIsoTime(null), null)
  assert.equal(formatIsoTime('nope'), null)
})

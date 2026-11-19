import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitnessSummary } from './fitnessSummary.js'

test('a day with food logged shows calories against the goal', () => {
  const s = fitnessSummary({ calories: 1450, calorieGoal: 2100, mealsLogged: 2 })
  assert.equal(s.logged, true)
  assert.equal(s.calories, 1450)
  assert.equal(s.goal, 2100)
  assert.ok(Math.abs(s.ratio - 69.05) < 0.01)
})

test('nothing logged (what the gateway sends: calories 0, no meals) is not a number', () => {
  const s = fitnessSummary({ calories: 0, calorieGoal: 2100, mealsLogged: 0 })
  assert.equal(s.logged, false)
  assert.equal(s.calories, null)
  assert.equal(s.goal, 2100)
})

test('the harness fixture field names are not the API: caloriesConsumed is ignored', () => {
  assert.equal(fitnessSummary({ caloriesConsumed: 1450, calorieGoal: 2100 }).logged, false)
})

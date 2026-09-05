/**
 * Regression test for BURN_REVIEW #16: the household log view was dead
 * twice over.
 *
 * 1. A routing shadow — `routeRequest`'s generic `base.startsWith('/logs/')`
 *    branch matched `/logs/household` and `/logs/household/:memberId/:date`
 *    before the household-specific branches ever ran, so both
 *    `getHouseholdMembers()` and `getHouseholdMemberLogs()` were routed to
 *    `GetFoodLogs` with "household"/a memberId poured into a `Date` scalar
 *    variable.
 * 2. Behind that, `GetHouseholdMemberLogs` itself declared `$date: Date!`
 *    while the gateway's typeDefs declare `date: String!` — a hard
 *    validation error the moment the routing was fixed.
 *
 * This pins the wire contract: `apiService.get(...)` on both household URLs
 * must reach the intended operation, and the member-logs query's `$date`
 * variable must be typed `String!`, matching the gateway.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn(() => Promise.resolve({ data: {} }));
const mutate = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate }),
}));

const { apiService } = await import('../apiService.js');

/** The operation name off the mocked query() call's document. */
const operationName = (call) => call.query.definitions[0].name.value;
/** The declared type of a named variable on the mocked call's document, e.g. 'String!'. */
const variableType = (call, name) => {
  const opDef = call.query.definitions[0];
  const varDef = opDef.variableDefinitions.find((v) => v.variable.name.value === name);
  const printType = (t) => {
    if (t.kind === 'NonNullType') return `${printType(t.type)}!`;
    if (t.kind === 'ListType') return `[${printType(t.type)}]`;
    return t.name.value;
  };
  return varDef && printType(varDef.type);
};

describe('apiService household log routes', () => {
  beforeEach(() => {
    query.mockClear();
  });

  it('routes GET /logs/household to GetFitnessHousehold, not GetFoodLogs', async () => {
    await apiService.get('/logs/household');

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0][0];
    expect(operationName(call)).toBe('GetFitnessHousehold');
  });

  it('routes GET /logs/household/:memberId/:date to GetHouseholdMemberLogs with the right variables', async () => {
    await apiService.get('/logs/household/member-42/2026-02-26');

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0][0];
    expect(operationName(call)).toBe('GetHouseholdMemberLogs');
    expect(call.variables).toEqual({ memberId: 'member-42', date: '2026-02-26' });
  });

  it('declares $date as String!, matching the gateway (not the Date scalar)', async () => {
    await apiService.get('/logs/household/member-42/2026-02-26');

    const call = query.mock.calls[0][0];
    expect(variableType(call, 'date')).toBe('String!');
    expect(variableType(call, 'memberId')).toBe('ID!');
  });

  it('still routes a plain calendar-date GET /logs/:date to GetFoodLogs', async () => {
    await apiService.get('/logs/2026-02-26');

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0][0];
    expect(operationName(call)).toBe('GetFoodLogs');
    expect(call.variables).toEqual({ date: '2026-02-26' });
  });
});

/**
 * SUITE_REVIEW_2026-11 FitnessGeek #1 — history reads that say what they want.
 *
 * `weightService.getWeightLogs({ limit })` / `bpService.getBPLogs({ startDate })`
 * built a query string that the GraphQL router then threw away: `/weight` and
 * `/blood-pressure` always became the bare query, so every caller got every
 * row whatever it asked for (and `getCurrentWeight({ limit: 1 })` downloaded
 * the whole history to read one number). These pin that the bounds reach the
 * gateway, that the bare form is still the bare query, and that a gateway
 * older than the arguments costs a bigger answer, never a failed read.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn();
vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate: vi.fn() }),
}));

const { weightService } = await import('../weightService.js');
const { bpService } = await import('../bpService.js');

const opName = (call) => call.query.definitions[0].name.value;

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(({ query: q }) => {
    const field = q.definitions[0].selectionSet.selections[0].name.value;
    return Promise.resolve({ data: { [field]: [] } });
  });
});

describe.each([
  ['weights', () => weightService.getWeightLogs({ limit: 20 }), () => weightService.getWeightLogs(), 'GetFitnessWeightsBounded', 'GetFitnessWeights'],
  ['blood pressure', () => bpService.getBPLogs({ limit: 20 }), () => bpService.getBPLogs(), 'GetBpsBounded', 'GetBps'],
])('%s', (_name, bounded, bare, boundedOp, bareOp) => {
  it('a limit reaches the gateway as a variable', async () => {
    await bounded();
    const call = query.mock.calls[0][0];
    expect(opName(call)).toBe(boundedOp);
    expect(call.variables).toEqual({ startDate: null, endDate: null, limit: 20 });
  });

  it('no bounds is still the bare query (every row)', async () => {
    await bare();
    const call = query.mock.calls[0][0];
    expect(opName(call)).toBe(bareOp);
    expect(call.variables).toBeUndefined();
  });

  it('an older gateway that rejects the arguments falls back to the bare query', async () => {
    query.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('Unknown argument "limit" on field "Query.x".'), {
      graphQLErrors: [{ message: 'Unknown argument "limit" on field "Query.x".' }],
    })));
    const res = await bounded();
    expect(res.success).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(opName(query.mock.calls[1][0])).toBe(bareOp);
  });

  it('any other failure is still a failure', async () => {
    query.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
    await expect(bounded()).rejects.toThrow('Network Error');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

it('a date window reaches the gateway too', async () => {
  await bpService.getBPLogs({ startDate: '2026-01-01', endDate: '2026-02-01' });
  expect(query.mock.calls[0][0].variables).toEqual({ startDate: '2026-01-01', endDate: '2026-02-01', limit: null });
});

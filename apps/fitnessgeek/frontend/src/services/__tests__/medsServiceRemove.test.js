// medsService.remove against deleteFitnessMedication's Boolean answer
// (REVIEW_2026-10 B18). `response.data || response` turned `false` into the
// truthy envelope, so a delete that didn't happen read as done.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiService.js', () => ({ apiService: { delete: vi.fn() } }));
vi.mock('../restClient.js', () => ({ restClient: {} }));
const { apiService } = await import('../apiService.js');
const { medsService } = await import('../medsService.js');

beforeEach(() => vi.clearAllMocks());

describe('medsService.remove', () => {
  it('rejects when the gateway answers false', async () => {
    apiService.delete.mockResolvedValue({ success: true, data: false });
    await expect(medsService.remove('m1')).rejects.toThrow();
  });

  it('resolves true when the gateway answers true', async () => {
    apiService.delete.mockResolvedValue({ success: true, data: true });
    await expect(medsService.remove('m1')).resolves.toBe(true);
    expect(apiService.delete).toHaveBeenCalledWith('/meds/m1');
  });
});

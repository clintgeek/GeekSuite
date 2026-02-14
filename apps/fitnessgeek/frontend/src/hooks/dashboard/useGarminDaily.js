import { useEffect, useState } from 'react';
import { fitnessGeekService } from '../../services/fitnessGeekService.js';

export const useGarminDaily = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [daily, setDaily] = useState(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const resp = await fitnessGeekService.getGarminDaily();
      setDaily(resp || null);
      setError('');
    } catch (e) {
      setError(e?.message || 'Failed to load Garmin daily');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, error, daily, refresh };
};



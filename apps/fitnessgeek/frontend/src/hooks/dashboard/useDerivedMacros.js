import { useEffect, useState } from 'react';
import { goalsService } from '../../services/goalsService.js';

export const useDerivedMacros = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [today, setToday] = useState(null);
  const [weekly, setWeekly] = useState([]);

  const refresh = async () => {
    try {
      setLoading(true);
      const resp = await goalsService.getDerivedMacros();
      const data = resp?.data || resp?.data?.data || resp;
      setToday(data?.today || null);
      setWeekly(Array.isArray(data?.weekly) ? data.weekly : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Failed to load derived macros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, error, today, weekly, refresh };
};



import { useState, useEffect } from 'react';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasPendingSync, setHasPendingSync] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for service worker sync messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_SUCCESS') {
          setHasPendingSync(false);
        }
      });
    }

    // Check for pending syncs on mount
    checkPendingSyncs();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkPendingSyncs = async () => {
    try {
      const db = await openDB();
      const foodLogs = await getAllPendingLogs(db, 'pendingFoodLogs');
      const weightLogs = await getAllPendingLogs(db, 'pendingWeightLogs');
      setHasPendingSync(foodLogs.length > 0 || weightLogs.length > 0);
    } catch (error) {
      console.error('Error checking pending syncs:', error);
    }
  };

  const savePendingLog = async (logType, data, token) => {
    try {
      const db = await openDB();
      const storeName = logType === 'food' ? 'pendingFoodLogs' : 'pendingWeightLogs';
      await addPendingLog(db, storeName, { data, token, timestamp: Date.now() });
      setHasPendingSync(true);

      // Request background sync if available
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(`sync-${logType === 'food' ? 'food-logs' : 'weight'}`);
      }
    } catch (error) {
      console.error('Error saving pending log:', error);
      throw error;
    }
  };

  return {
    isOnline,
    hasPendingSync,
    savePendingLog,
    checkPendingSyncs
  };
};

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FitnessGeekOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingFoodLogs')) {
        db.createObjectStore('pendingFoodLogs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pendingWeightLogs')) {
        db.createObjectStore('pendingWeightLogs', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllPendingLogs(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function addPendingLog(db, storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(data);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

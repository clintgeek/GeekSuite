import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getUserProgress } from '../services/userService';

const UserProgressContext = createContext(null);

export function UserProgressProvider({ children }) {
  const { currentUser, isAuthenticated, updateUserData } = useAuth();
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      loadProgress();
    } else {
      setProgress(null);
    }
  }, [isAuthenticated, currentUser]);

  const loadProgress = async () => {
    if (!currentUser) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await getUserProgress(currentUser.id);
      setProgress(data);
    } catch (err) {
      console.error('Failed to load user progress:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProgress = async () => {
    await loadProgress();
  };

  const resetProgress = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Call the reset API
      const { resetUserProgress } = await import('../services/userService');
      await resetUserProgress();

      // Refresh the progress data
      await refreshProgress();

      // Update the current user's data in the auth context
      if (currentUser) {
        const { getCurrentUser } = await import('../services/userService');
        const updatedUser = await getCurrentUser();
        updateUserData(updatedUser);
      }

      return true;
    } catch (err) {
      setError(err.message);
      console.error('Error resetting progress:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    progress,
    isLoading,
    error,
    refreshProgress,
    resetProgress,
    totalXP: progress?.total_xp ?? currentUser?.total_xp ?? 0,
    level: progress?.level ?? currentUser?.level ?? 1,
    completedLessons: progress?.completed_lessons || 0,
    totalPracticeTime: progress?.total_practice_time || 0,
    achievements: progress?.achievements || [],
  };

  return <UserProgressContext.Provider value={value}>{children}</UserProgressContext.Provider>;
}

export function useUserProgress() {
  const context = useContext(UserProgressContext);
  if (!context) {
    throw new Error('useUserProgress must be used within UserProgressProvider');
  }
  return context;
}

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProgress } from '../context/UserProgressContext';
import { getUserProgress, updateUser } from '../services/userService';
import { getAllAchievements } from '../services/achievementService';
import { Button } from '@mui/material';
import ConfirmationDialog from '../components/ConfirmationDialog';
import { toast } from 'react-toastify';

export default function ProfilePage() {
  const { currentUser, updateUserData } = useAuth();
  const { totalXP, level, resetProgress, isLoading: isResetting } = useUserProgress();
  const [progress, setProgress] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const uiMode = currentUser?.preferences?.uiMode === 'kid' ? 'kid' : 'adult';

  useEffect(() => {
    loadProfileData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [progressData, achievementsData] = await Promise.all([
        getUserProgress(currentUser.id),
        getAllAchievements(),
      ]);
      setProgress(progressData);
      setAchievements(achievementsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = async (mode) => {
    try {
      const nextPrefs = {
        ...(currentUser.preferences || {}),
        uiMode: mode,
      };

      const updatedProfile = await updateUser(currentUser.id, { preferences: nextPrefs });

      // Merge the updated profile with existing user data
      const updatedUser = {
        ...currentUser,
        preferences: updatedProfile.preferences,
        display_name: updatedProfile.display_name,
        bio: updatedProfile.bio,
        avatar_url: updatedProfile.avatar_url,
      };

      updateUserData(updatedUser);
      toast.success(`Switched to ${mode === 'kid' ? 'Kid' : 'Adult'} mode`);
    } catch (err) {
      console.error('Failed to update uiMode:', err);
      toast.error('Failed to update experience mode. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="profile-page">
        <div className="container">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  const xpProgress = ((totalXP % 100) / 100) * 100;

  const handleResetProgress = async () => {
    setShowResetConfirm(false);
    const success = await resetProgress();

    if (success) {
      // Refresh profile data
      await loadProfileData();
      toast.success('Your progress has been reset successfully!');
    } else {
      toast.error('Failed to reset progress. Please try again.');
    }
  };

  return (
    <div className="profile-page">
      <div className="container">
        <div className="profile-header">
          <div className="profile-avatar">
            {currentUser.avatar_url ? (
              <img src={currentUser.avatar_url} alt={currentUser.display_name} />
            ) : (
              <div className="avatar-placeholder">
                {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="profile-info">
            <h1>{currentUser.display_name || currentUser.username}</h1>
            <p className="username">@{currentUser.username}</p>
            {currentUser.bio && <p className="bio">{currentUser.bio}</p>}

            <div className="profile-actions" style={{ marginTop: '1rem' }}>
              <Button
                variant="outlined"
                color="error"
                onClick={() => setShowResetConfirm(true)}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Reset Progress'}
              </Button>
            </div>

            <div className="mode-toggle" style={{ marginTop: '0.75rem' }}>
              <span style={{ marginRight: '0.5rem' }}>Experience mode:</span>
              <button
                type="button"
                className={uiMode === 'adult' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => handleModeChange('adult')}
              >
                Adult
              </button>
              <button
                type="button"
                className={uiMode === 'kid' ? 'btn-primary' : 'btn-secondary'}
                style={{ marginLeft: '0.5rem' }}
                onClick={() => handleModeChange('kid')}
              >
                Kid / Guided
              </button>
            </div>

            <div className="level-info">
              <h2>Level {level}</h2>
              <div className="xp-bar">
                <div className="xp-progress" style={{ width: `${xpProgress}%` }}></div>
              </div>
              <p className="xp-text">{totalXP % 100} / 100 XP to next level</p>
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⭐</div>
            <div className="stat-value">{totalXP}</div>
            <div className="stat-label">Total XP</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📚</div>
            <div className="stat-value">{progress?.completed_lessons || 0}</div>
            <div className="stat-label">Lessons Completed</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-value">
              {Math.round((progress?.total_practice_time || 0) / 60)}
            </div>
            <div className="stat-label">Hours Practiced</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🏆</div>
            <div className="stat-value">{progress?.achievements?.length || 0}</div>
            <div className="stat-label">Achievements</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-value">{progress?.current_streak || 0} days</div>
            <div className="stat-label">
              Current Streak (Best: {progress?.longest_streak || 0} days)
            </div>
          </div>
        </div>

        <div className="achievements-section">
          <h2>Achievements</h2>
          {achievements.length === 0 ? (
            <p>No achievements available yet.</p>
          ) : (
            <div className="achievements-grid">
              {achievements.map((achievement) => {
                const isUnlocked = progress?.achievements?.some(
                  (ua) => ua.achievement_id === achievement.id
                );
                return (
                  <div
                    key={achievement.id}
                    className={`achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                  >
                    <div className="achievement-icon">{achievement.icon || '🏆'}</div>
                    <h3>{achievement.name}</h3>
                    <p>{achievement.description}</p>
                    <div className="achievement-xp">+{achievement.xp_reward} XP</div>
                    {isUnlocked && <div className="achievement-badge">✓ Unlocked</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="recent-practice">
          <h2>Recent Practice Sessions</h2>
          {!progress?.recent_sessions || progress.recent_sessions.length === 0 ? (
            <p>No practice sessions yet. Start practicing to see your history here!</p>
          ) : (
            <div className="sessions-list">
              {progress.recent_sessions.map((session) => (
                <div key={session.id} className="session-card">
                  <div className="session-date">
                    {new Date(session.start_time || session.end_time).toLocaleDateString()}
                  </div>
                  <div className="session-duration">{session.duration_minutes} minutes</div>
                  {session.notes && <p className="session-notes">{session.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetProgress}
        title="Reset Your Progress"
        message="Are you sure you want to reset all your progress? This will delete all your completed lessons and reset your XP. This action cannot be undone."
        confirmText="Yes, Reset Progress"
      />
    </div>
  );
}

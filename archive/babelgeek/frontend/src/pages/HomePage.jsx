import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Stack,
  LinearProgress,
  Chip,
  Avatar,
  Paper,
  Tooltip,
  Skeleton,
  Alert,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import statsService from "../services/statsService";
import progressService from "../services/progressService";
import lessonsService from "../services/lessonsService";

// Icons
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import TranslateIcon from "@mui/icons-material/Translate";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ChatIcon from "@mui/icons-material/Chat";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import SchoolIcon from "@mui/icons-material/School";
import StarIcon from "@mui/icons-material/Star";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

const MotionCard = motion(Card);

// XP level thresholds
const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000];

const getXpForLevel = (level) => {
  return XP_THRESHOLDS[level - 1] || 0;
};

const getXpForNextLevel = (level) => {
  return XP_THRESHOLDS[level] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
};

const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState({ achievements: [], milestones: [] });
  const [nextLesson, setNextLesson] = useState(null);
  const [learningPath, setLearningPath] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all dashboard data in parallel
      const [dashboardStats, achievementsData, nextLessonData, pathData] = await Promise.all([
        statsService.getDashboardStats().catch((err) => {
          console.error("Error fetching stats:", err);
          return null;
        }),
        statsService.getAchievements().catch((err) => {
          console.error("Error fetching achievements:", err);
          return { achievements: [], milestones: [] };
        }),
        progressService.getNextLesson("spanish").catch((err) => {
          console.error("Error fetching next lesson:", err);
          return null;
        }),
        lessonsService.getLearningPath("spanish").catch((err) => {
          console.error("Error fetching learning path:", err);
          return [];
        }),
      ]);

      if (dashboardStats) {
        setStats(dashboardStats);
      }

      setAchievements(achievementsData);

      // Flatten the units/lessons structure
      const allLessons = (pathData || []).flatMap(unit => unit.lessons || []);
      setLearningPath(allLessons);

      // Determine next lesson
      if (nextLessonData?.nextLesson) {
        // User has an in-progress lesson
        const lesson = allLessons.find((l) => l.slug === nextLessonData.nextLesson.slug);
        if (lesson) {
          setNextLesson({
            ...lesson,
            currentStepIndex: nextLessonData.nextLesson.currentStepIndex,
            status: nextLessonData.nextLesson.status,
          });
        }
      } else if (allLessons.length > 0) {
        // Find first uncompleted lesson
        const completedSlugs = new Set(nextLessonData?.completedSlugs || []);
        const firstUncompleted = allLessons.find((l) => !completedSlugs.has(l.slug));
        if (firstUncompleted) {
          setNextLesson(firstUncompleted);
        } else {
          // All done! Show first lesson anyway
          setNextLesson(allLessons[0]);
        }
      }
    } catch (err) {
      console.error("Error loading dashboard:", err);
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const username = user?.username || user?.email?.split("@")[0] || "Learner";
  const level = stats?.level || 1;
  const totalXp = stats?.totalXp || 0;
  const xpForCurrentLevel = getXpForLevel(level);
  const xpForNextLevel = getXpForNextLevel(level);
  const currentXpProgress = ((totalXp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "¡Buenos días";
    if (hour < 18) return "¡Buenas tardes";
    return "¡Buenas noches";
  };

  const getStreakMessage = (streak) => {
    if (!streak || streak === 0) return "Start your streak today!";
    if (streak === 1) return "Great start! Keep it going!";
    if (streak < 5) return "You're building momentum!";
    if (streak < 10) return "You're on fire! 🔥";
    if (streak < 30) return "Incredible dedication!";
    return "You're a legend! 🏆";
  };

  // Calculate weekly activity chart data
  const getWeeklyChartData = () => {
    if (!stats?.weeklyActivity) {
      return Array(7).fill(0);
    }
    return stats.weeklyActivity.map((day) => day.xp);
  };

  const weeklyXpData = getWeeklyChartData();
  const weekDays = stats?.weeklyActivity?.map((d) => d.day) || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Box sx={{ pb: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Welcome Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            mb: 4,
            borderRadius: 4,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: "white",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: -50,
              right: -50,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: -30,
              right: 100,
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
            }}
          />

          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={2}>
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                {getGreeting()}, {username}! 👋
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Chip
                  icon={<LocalFireDepartmentIcon />}
                  label={`${loading ? "—" : stats?.streak || 0} day streak`}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.2)",
                    color: "white",
                    fontWeight: 600,
                    "& .MuiChip-icon": { color: "#ff9800" },
                  }}
                />
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {loading ? "" : getStreakMessage(stats?.streak)}
                </Typography>
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ bgcolor: "rgba(255,255,255,0.2)", width: 48, height: 48 }}>
                <Typography variant="h6" fontWeight={700}>
                  {loading ? "—" : level}
                </Typography>
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Level {loading ? "—" : level}
                </Typography>
                <Box sx={{ width: 100 }}>
                  <LinearProgress
                    variant="determinate"
                    value={loading ? 0 : Math.min(currentXpProgress, 100)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: "rgba(255,255,255,0.2)",
                      "& .MuiLinearProgress-bar": { bgcolor: "#ffc107" },
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ opacity: 0.7, fontSize: 10 }}>
                  {loading ? "—" : `${totalXp - xpForCurrentLevel}/${xpForNextLevel - xpForCurrentLevel} XP`}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Paper>
      </motion.div>

      <Grid container spacing={3}>
        {/* Continue Learning - Primary CTA */}
        <Grid item xs={12} md={8}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            sx={{
              borderRadius: 3,
              border: "2px solid",
              borderColor: "primary.main",
              background: (theme) => alpha(theme.palette.primary.main, 0.04),
            }}
          >
            <CardContent sx={{ p: 3 }}>
              {loading ? (
                <Stack spacing={2}>
                  <Skeleton width={120} height={24} />
                  <Skeleton width="60%" height={32} />
                  <Skeleton width="40%" height={20} />
                  <Skeleton width={150} height={42} />
                </Stack>
              ) : nextLesson ? (
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box sx={{ flex: 1 }}>
                    <Chip
                      size="small"
                      label={nextLesson.status === "in_progress" ? "Continue Learning" : "Up Next"}
                      color="primary"
                      sx={{ mb: 1.5, fontWeight: 600 }}
                    />
                    <Typography variant="h5" fontWeight={700} gutterBottom>
                      {nextLesson.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {nextLesson.description || nextLesson.subtitle}
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                      <Chip
                        size="small"
                        icon={<CalendarTodayIcon />}
                        label={`${nextLesson.duration || nextLesson.estimatedMinutes || 10} min`}
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        icon={<StarIcon />}
                        label={`+${nextLesson.xp || nextLesson.xpReward || 50} XP`}
                        variant="outlined"
                        color="warning"
                      />
                    </Stack>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => navigate(`/lesson/spanish/${nextLesson.slug}`)}
                      sx={{ borderRadius: 2, px: 4 }}
                    >
                      {nextLesson.status === "in_progress" ? "Continue" : "Start Lesson"}
                    </Button>
                  </Box>
                  <Box
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      alignItems: "center",
                      justifyContent: "center",
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                    }}
                  >
                    <SchoolIcon sx={{ fontSize: 60, color: "primary.main", opacity: 0.8 }} />
                  </Box>
                </Stack>
              ) : (
                <Box textAlign="center" py={4}>
                  <Typography variant="h6" color="text.secondary">
                    No lessons available yet
                  </Typography>
                  <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate("/learn")}>
                    Browse Lessons
                  </Button>
                </Box>
              )}
            </CardContent>
          </MotionCard>
        </Grid>

        {/* Streak & Goal Card */}
        <Grid item xs={12} md={4}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            sx={{ borderRadius: 3, height: "100%" }}
          >
            <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Your Streak
              </Typography>
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <Box
                  sx={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    background: (theme) =>
                      stats?.streak > 0
                        ? `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.error.main} 100%)`
                        : theme.palette.grey[200],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      bgcolor: "background.paper",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                    }}
                  >
                    <LocalFireDepartmentIcon sx={{ fontSize: 28, color: stats?.streak > 0 ? "warning.main" : "grey.400" }} />
                    <Typography variant="h5" fontWeight={700}>
                      {loading ? "—" : stats?.streak || 0}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {loading ? "Loading..." : getStreakMessage(stats?.streak)}
                </Typography>
                {stats?.longestStreak > 0 && stats?.longestStreak > (stats?.streak || 0) && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Best: {stats.longestStreak} days
                  </Typography>
                )}
              </Box>
            </CardContent>
          </MotionCard>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            {[
              { label: "Total XP", value: loading ? "—" : stats?.totalXp || 0, icon: <EmojiEventsIcon />, color: "primary" },
              { label: "Words Learned", value: loading ? "—" : stats?.vocabularyLearned || 0, icon: <TranslateIcon />, color: "success" },
              { label: "Lessons Done", value: loading ? "—" : stats?.lessonsCompleted || 0, icon: <MenuBookIcon />, color: "info" },
              { label: "Best Streak", value: loading ? "—" : `${stats?.longestStreak || 0} days`, icon: <TrendingUpIcon />, color: "warning" },
            ].map((stat, index) => (
              <Grid item xs={6} sm={3} key={stat.label}>
                <MotionCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + index * 0.05 }}
                  sx={{ borderRadius: 2 }}
                >
                  <CardContent sx={{ textAlign: "center", py: 2 }}>
                    <Avatar
                      sx={{
                        bgcolor: (theme) => alpha(theme.palette[stat.color].main, 0.1),
                        color: `${stat.color}.main`,
                        mx: "auto",
                        mb: 1,
                        width: 44,
                        height: 44,
                      }}
                    >
                      {stat.icon}
                    </Avatar>
                    <Typography variant="h5" fontWeight={700}>
                      {stat.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {stat.label}
                    </Typography>
                  </CardContent>
                </MotionCard>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Practice Modes */}
        <Grid item xs={12} md={6}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            sx={{ borderRadius: 3 }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Practice Today
              </Typography>
              <Stack spacing={2}>
                {[
                  { icon: <MenuBookIcon />, title: "Quick Review", desc: "Practice what you've learned", to: "/learn", color: "primary" },
                  { icon: <ChatIcon />, title: "Conversation", desc: "Chat with AI in Spanish", to: "/conversation", color: "success" },
                  { icon: <VolumeUpIcon />, title: "Listening", desc: "Train your ear", to: "/learn", color: "info" },
                ].map((mode) => (
                  <Paper
                    key={mode.title}
                    variant="outlined"
                    sx={{
                      p: 2,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      "&:hover": {
                        borderColor: `${mode.color}.main`,
                        bgcolor: (theme) => alpha(theme.palette[mode.color].main, 0.04),
                        transform: "translateX(4px)",
                      },
                    }}
                    onClick={() => navigate(mode.to)}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar sx={{ bgcolor: (theme) => alpha(theme.palette[mode.color].main, 0.1), color: `${mode.color}.main` }}>
                        {mode.icon}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {mode.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {mode.desc}
                        </Typography>
                      </Box>
                      <PlayArrowIcon color="action" />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </MotionCard>
        </Grid>

        {/* Weekly Activity */}
        <Grid item xs={12} md={6}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            sx={{ borderRadius: 3 }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                This Week (XP)
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ mt: 2 }}>
                {weekDays.map((day, index) => {
                  const xp = weeklyXpData[index] || 0;
                  const today = new Date();
                  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  const isToday = day === dayNames[today.getDay()];
                  const maxXp = Math.max(...weeklyXpData, 1);
                  const height = xp > 0 ? Math.max(20, (xp / maxXp) * 80) : 8;

                  return (
                    <Tooltip key={index} title={`${xp} XP`} arrow>
                      <Box sx={{ textAlign: "center", flex: 1 }}>
                        <Box
                          sx={{
                            height: 100,
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                            mb: 1,
                          }}
                        >
                          <Box
                            sx={{
                              width: "70%",
                              height,
                              borderRadius: 1,
                              bgcolor: xp > 0
                                ? isToday
                                  ? "primary.main"
                                  : "primary.light"
                                : "grey.200",
                              transition: "height 0.3s ease",
                            }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          fontWeight={isToday ? 700 : 400}
                          color={isToday ? "primary.main" : "text.secondary"}
                        >
                          {day}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>
              <Box sx={{ mt: 2, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Total: <strong>{weeklyXpData.reduce((a, b) => a + b, 0)} XP</strong> this week
                </Typography>
              </Box>
            </CardContent>
          </MotionCard>
        </Grid>

        {/* Achievements */}
        <Grid item xs={12}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            sx={{ borderRadius: 3 }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  Achievements
                </Typography>
                <Button size="small" onClick={() => navigate("/stats")}>
                  View All
                </Button>
              </Stack>
              {loading ? (
                <Stack direction="row" spacing={2}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} variant="rectangular" width={100} height={100} sx={{ borderRadius: 2 }} />
                  ))}
                </Stack>
              ) : (
                <Grid container spacing={2}>
                  {achievements.achievements.slice(0, 6).map((achievement) => (
                    <Grid item xs={6} sm={4} md={2} key={achievement.id}>
                      <Tooltip
                        title={
                          <Box>
                            <Typography variant="subtitle2">{achievement.name}</Typography>
                            <Typography variant="caption">{achievement.description}</Typography>
                          </Box>
                        }
                        arrow
                      >
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            textAlign: "center",
                            opacity: achievement.unlocked ? 1 : 0.5,
                            position: "relative",
                            transition: "transform 0.2s",
                            "&:hover": { transform: "scale(1.05)" },
                          }}
                        >
                          <Typography variant="h4" sx={{ mb: 0.5 }}>
                            {achievement.icon}
                          </Typography>
                          <Typography variant="caption" fontWeight={600} noWrap>
                            {achievement.name}
                          </Typography>
                          {!achievement.unlocked && (
                            <LockIcon
                              sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                fontSize: 14,
                                color: "text.disabled",
                              }}
                            />
                          )}
                          {achievement.unlocked && (
                            <CheckCircleIcon
                              sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                fontSize: 14,
                                color: "success.main",
                              }}
                            />
                          )}
                        </Paper>
                      </Tooltip>
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Milestones */}
              {achievements.milestones.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Progress
                  </Typography>
                  <Stack spacing={2}>
                    {achievements.milestones.map((milestone) => (
                      <Box key={milestone.name}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography>{milestone.icon}</Typography>
                            <Typography variant="body2" fontWeight={500}>
                              {milestone.name}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {milestone.current} / {milestone.target}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min((milestone.current / milestone.target) * 100, 100)}
                          sx={{ height: 8, borderRadius: 4 }}
                        />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </MotionCard>
        </Grid>

        {/* Language Card */}
        <Grid item xs={12}>
          <MotionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            sx={{ borderRadius: 3, bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.04) }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="h3">🇪🇸</Typography>
                  <Box>
                    <Typography variant="h6" fontWeight={600}>
                      Spanish
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stats?.lessonsCompleted || 0} lessons • {stats?.vocabularyLearned || 0} words
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => navigate("/learn")}>
                    View Learning Path
                  </Button>
                  <Button variant="text" disabled>
                    + Add Language
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </MotionCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;

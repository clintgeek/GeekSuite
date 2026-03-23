import { Box, Container, Typography, Card, CardContent, Grid, LinearProgress, Stack, Divider } from "@mui/material";
import { motion } from "framer-motion";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MenuBookIcon from "@mui/icons-material/MenuBook";

const StatsPage = () => {
  // Placeholder stats - will come from API
  const stats = {
    streak: 5,
    totalXp: 850,
    level: 3,
    xpToNextLevel: 1000,
    lessonsCompleted: 12,
    vocabularyLearned: 87,
    totalTimeMinutes: 245,
    weeklyActivity: [30, 45, 20, 0, 15, 40, 35]
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Your Progress
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track your learning journey and celebrate your achievements.
          </Typography>
        </Box>

        {/* Key Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: "center" }}>
                <LocalFireDepartmentIcon sx={{ fontSize: 40, color: "warning.main", mb: 1 }} />
                <Typography variant="h4" fontWeight={700} color="warning.main">
                  {stats.streak}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Day Streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: "center" }}>
                <EmojiEventsIcon sx={{ fontSize: 40, color: "primary.main", mb: 1 }} />
                <Typography variant="h4" fontWeight={700} color="primary.main">
                  {stats.totalXp}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total XP
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: "center" }}>
                <MenuBookIcon sx={{ fontSize: 40, color: "success.main", mb: 1 }} />
                <Typography variant="h4" fontWeight={700} color="success.main">
                  {stats.lessonsCompleted}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Lessons Done
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: "center" }}>
                <AccessTimeIcon sx={{ fontSize: 40, color: "info.main", mb: 1 }} />
                <Typography variant="h4" fontWeight={700} color="info.main">
                  {Math.floor(stats.totalTimeMinutes / 60)}h
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Time Spent
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Level Progress */}
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>
                Level {stats.level}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.totalXp} / {stats.xpToNextLevel} XP
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(stats.totalXp / stats.xpToNextLevel) * 100}
              sx={{ height: 12, borderRadius: 6 }}
            />
          </CardContent>
        </Card>

        {/* Weekly Activity */}
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
              This Week
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="space-between">
              {stats.weeklyActivity.map((minutes, index) => (
                <Box key={weekDays[index]} sx={{ textAlign: "center", flex: 1 }}>
                  <Box
                    sx={{
                      height: 100,
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      mb: 1
                    }}
                  >
                    <Box
                      sx={{
                        width: "60%",
                        height: `${Math.max(10, (minutes / 60) * 100)}%`,
                        bgcolor: minutes > 0 ? "primary.main" : "action.disabledBackground",
                        borderRadius: 1,
                        transition: "height 0.3s ease"
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {weekDays[index]}
                  </Typography>
                  <Typography variant="caption" display="block" color="primary.main" fontWeight={600}>
                    {minutes}m
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </motion.div>
    </Container>
  );
};

export default StatsPage;

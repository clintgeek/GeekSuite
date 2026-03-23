import { useState, useEffect } from "react";
import { Box, Container, Typography, Card, CardContent, Button, LinearProgress, Chip, Stack, CircularProgress, Alert } from "@mui/material";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { getLearningPath } from "../services/lessonsService";

const LearnPage = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Spanish only - will come from user profile API
  const language = {
    code: "es",
    name: "Spanish",
    flag: "🇪🇸",
    progress: 15,
    level: "A1"
  };

  useEffect(() => {
    const fetchLearningPath = async () => {
      try {
        setLoading(true);
        const data = await getLearningPath("spanish");
        setUnits(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch learning path:", err);
        setError("Failed to load lessons. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchLearningPath();
  }, []);

  const handleStartLesson = (lessonSlug) => {
    navigate(`/lesson/${lessonSlug}`);
  };

  // Calculate total lessons
  const totalLessons = units.reduce((acc, unit) => acc + unit.lessons.length, 0);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {/* Language Header */}
        <Card sx={{ mb: 4, background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}>
          <CardContent sx={{ color: "white" }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="h2" component="span">
                {language.flag}
              </Typography>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h5" fontWeight={700}>
                  {language.name}
                </Typography>
                <Chip
                  label={`Level ${language.level}`}
                  size="small"
                  sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "white", mt: 0.5 }}
                />
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="h4" fontWeight={700}>
                  {totalLessons}
                </Typography>
                <Typography variant="caption">lessons available</Typography>
              </Box>
            </Stack>
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={language.progress}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: "rgba(255,255,255,0.2)",
                  "& .MuiLinearProgress-bar": { bgcolor: "white" }
                }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Learning Path */}
        <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
          Learning Path
        </Typography>

        {loading ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>Loading lessons...</Typography>
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          units.map((unit, unitIdx) => (
            <Card key={unit.id} sx={{ mb: 3 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>
                    Unit {unitIdx + 1}: {unit.title}
                  </Typography>
                  <Chip
                    label={`${unit.lessons.length} lessons`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                <Stack spacing={1}>
                  {unit.lessons.map((lesson, idx) => {
                    // For now, mark first lesson of first unit as current
                    const isCurrent = unitIdx === 0 && idx === 0;

                    return (
                      <Box
                        key={lesson.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: isCurrent ? "primary.light" : "grey.100",
                          cursor: "pointer",
                          "&:hover": {
                            bgcolor: isCurrent ? "primary.main" : "grey.200"
                          },
                          transition: "all 0.2s"
                        }}
                        onClick={() => handleStartLesson(lesson.slug)}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            bgcolor: isCurrent ? "primary.main" : "grey.400",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            fontWeight: 600,
                            mr: 2
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              color: isCurrent ? "primary.dark" : "text.primary",
                              fontWeight: isCurrent ? 600 : 400
                            }}
                          >
                            {lesson.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {lesson.estimatedTimeMinutes} min • +{lesson.xpReward} XP
                          </Typography>
                        </Box>
                        {isCurrent && (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrowIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartLesson(lesson.slug);
                            }}
                          >
                            Start
                          </Button>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          ))
        )}
      </motion.div>
    </Container>
  );
};

export default LearnPage;

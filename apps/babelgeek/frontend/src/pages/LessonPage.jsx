import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { playAudio as playElevenLabsAudio } from "../services/audioService";
import { getLesson } from "../services/lessonsService";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  LinearProgress,
  IconButton,
  Stack,
  Chip,
  Paper,
  CircularProgress,
  Alert
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import CelebrationIcon from "@mui/icons-material/Celebration";

const LessonPage = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [matchingState, setMatchingState] = useState({ selected: null, matched: [] });

  useEffect(() => {
    const fetchLesson = async () => {
      try {
        setLoading(true);
        const data = await getLesson(lessonId, "spanish");
        setLesson(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch lesson:", err);
        setError("Failed to load lesson. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchLesson();
  }, [lessonId]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }}>Loading lesson...</Typography>
      </Container>
    );
  }

  if (error || !lesson) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || "Lesson not found"}
        </Alert>
        <Button variant="contained" onClick={() => navigate("/learn")}>
          Back to Learning Path
        </Button>
      </Container>
    );
  }

  const steps = lesson.content?.steps || [];
  const currentStep = steps[currentStepIndex];
  const totalSteps = steps.length;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const playAudio = (text) => {
    // Use audioPhrase if available, otherwise use the phrase/text
    const audioText = text || currentStep.audioPhrase || currentStep.phrase;
    if (audioText) {
      playElevenLabsAudio(audioText, "es");
    }
  };

  const handleNext = () => {
    setCompletedSteps((prev) => new Set([...prev, currentStep.id]));
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      setMatchingState({ selected: null, matched: [] });
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      setMatchingState({ selected: null, matched: [] });
    }
  };

  const handleComplete = () => {
    navigate("/learn");
  };

  const handleMatchSelect = (item, side) => {
    if (matchingState.matched.includes(item)) return;

    if (matchingState.selected && matchingState.selected.side !== side) {
      // Check if it's a match
      const pair = currentStep.pairs.find(
        (p) =>
          (p.left === matchingState.selected.item && p.right === item) ||
          (p.right === matchingState.selected.item && p.left === item)
      );
      if (pair) {
        setMatchingState({
          selected: null,
          matched: [...matchingState.matched, pair.left, pair.right]
        });
      } else {
        setMatchingState({ selected: null, matched: matchingState.matched });
      }
    } else {
      setMatchingState({ ...matchingState, selected: { item, side } });
    }
  };

  const renderStepContent = () => {
    if (!currentStep) return null;

    switch (currentStep.type) {
      case "text":
      case "text+image":
        return (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              {currentStep.title}
            </Typography>
            <Typography
              variant="body1"
              sx={{ whiteSpace: "pre-line", lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{
                __html: currentStep.body
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br/>")
              }}
            />
          </Box>
        );

      case "text+audio":
        return (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              {currentStep.title}
            </Typography>
            <Typography
              variant="body1"
              sx={{ whiteSpace: "pre-line", lineHeight: 1.8, mb: 3 }}
              dangerouslySetInnerHTML={{
                __html: currentStep.body
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br/>")
              }}
            />
            {(currentStep.audioPhrase || currentStep.audioUrl) && (
              <IconButton
                onClick={() => playAudio()}
                color="primary"
                size="large"
                sx={{
                  bgcolor: "primary.light",
                  "&:hover": { bgcolor: "primary.main", color: "white" }
                }}
              >
                <VolumeUpIcon fontSize="large" />
              </IconButton>
            )}
          </Box>
        );

      case "listen_repeat":
        return (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              {currentStep.title}
            </Typography>

            <Paper elevation={2} sx={{ p: 4, my: 3, bgcolor: "primary.light", borderRadius: 3 }}>
              <Typography variant="h4" fontWeight={700} color="primary.dark" gutterBottom>
                {currentStep.phrase}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {currentStep.translation}
              </Typography>
            </Paper>

            <IconButton
              onClick={() => playAudio(currentStep.audioPhrase || currentStep.phrase)}
              color="primary"
              size="large"
              sx={{
                bgcolor: "primary.main",
                color: "white",
                width: 80,
                height: 80,
                "&:hover": { bgcolor: "primary.dark" }
              }}
            >
              <VolumeUpIcon sx={{ fontSize: 40 }} />
            </IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Listen and repeat aloud
            </Typography>
          </Box>
        );

      case "matching":
        const allMatched = matchingState.matched.length === currentStep.pairs.length * 2;
        return (
          <Box>
            <Typography variant="h5" fontWeight={600} gutterBottom textAlign="center">
              {currentStep.title}
            </Typography>

            <Stack direction="row" spacing={4} justifyContent="center" sx={{ mt: 3 }}>
              {/* Left column */}
              <Stack spacing={1.5}>
                {currentStep.pairs.map((pair) => (
                  <Button
                    key={pair.left}
                    variant={
                      matchingState.matched.includes(pair.left)
                        ? "contained"
                        : matchingState.selected?.item === pair.left
                        ? "contained"
                        : "outlined"
                    }
                    color={matchingState.matched.includes(pair.left) ? "success" : "primary"}
                    onClick={() => handleMatchSelect(pair.left, "left")}
                    disabled={matchingState.matched.includes(pair.left)}
                    sx={{ minWidth: 140, justifyContent: "flex-start" }}
                  >
                    {pair.left}
                  </Button>
                ))}
              </Stack>

              {/* Right column */}
              <Stack spacing={1.5}>
                {currentStep.pairs
                  .map((p) => p.right)
                  .sort()
                  .map((right) => (
                    <Button
                      key={right}
                      variant={
                        matchingState.matched.includes(right)
                          ? "contained"
                          : matchingState.selected?.item === right
                          ? "contained"
                          : "outlined"
                      }
                      color={matchingState.matched.includes(right) ? "success" : "primary"}
                      onClick={() => handleMatchSelect(right, "right")}
                      disabled={matchingState.matched.includes(right)}
                      sx={{ minWidth: 140, justifyContent: "flex-start" }}
                    >
                      {right}
                    </Button>
                  ))}
              </Stack>
            </Stack>

            {allMatched && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Alert severity="success" sx={{ mt: 3 }}>
                  <CheckCircleIcon sx={{ mr: 1 }} /> Perfect! All matched correctly!
                </Alert>
              </motion.div>
            )}
          </Box>
        );

      case "checkpoint":
        return (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              {currentStep.title}
            </Typography>
            <Paper elevation={0} sx={{ p: 3, bgcolor: "success.light", borderRadius: 3, mt: 2 }}>
              <Typography
                variant="body1"
                sx={{ whiteSpace: "pre-line", lineHeight: 2 }}
                dangerouslySetInnerHTML={{
                  __html: currentStep.body.replace(/\n/g, "<br/>")
                }}
              />
            </Paper>
          </Box>
        );

      case "celebration":
        return (
          <Box sx={{ textAlign: "center" }}>
            <CelebrationIcon sx={{ fontSize: 80, color: "warning.main", mb: 2 }} />
            <Typography variant="h4" fontWeight={700} gutterBottom>
              {currentStep.title}
            </Typography>
            <Typography
              variant="body1"
              sx={{ whiteSpace: "pre-line", lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{
                __html: currentStep.body
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br/>")
              }}
            />
            <Box sx={{ mt: 3 }}>
              <Chip
                label={`+${lesson.meta?.xpReward || 50} XP`}
                color="success"
                sx={{ fontSize: "1.2rem", py: 2, px: 1 }}
              />
            </Box>
          </Box>
        );

      default:
        return (
          <Typography variant="body1">
            Unknown step type: {currentStep.type}
          </Typography>
        );
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate("/learn")}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {lesson.meta?.title || lesson.slug}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Step {currentStepIndex + 1} of {totalSteps}
          </Typography>
        </Box>
        <Chip label={lesson.level} color="primary" size="small" />
      </Stack>

      {/* Progress Bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ height: 8, borderRadius: 4, mb: 4 }}
      />

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep?.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <Card sx={{ mb: 3, minHeight: 300 }}>
            <CardContent sx={{ p: 4 }}>{renderStepContent()}</CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button
          variant="outlined"
          startIcon={<NavigateBeforeIcon />}
          onClick={handlePrevious}
          disabled={currentStepIndex === 0}
        >
          Previous
        </Button>

        {isLastStep ? (
          <Button
            variant="contained"
            color="success"
            endIcon={<CheckCircleIcon />}
            onClick={handleComplete}
          >
            Complete Lesson
          </Button>
        ) : (
          <Button
            variant="contained"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
          >
            Next
          </Button>
        )}
      </Stack>
    </Container>
  );
};

export default LessonPage;

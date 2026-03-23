import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { playAudio as playElevenLabsAudio } from "../services/audioService";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  IconButton,
  Stack,
  LinearProgress,
  Chip
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";

// Mock vocabulary data
const mockVocabulary = [
  { id: 1, spanish: "el libro", english: "the book", mastery: 0.8 },
  { id: 2, spanish: "la casa", english: "the house", mastery: 0.6 },
  { id: 3, spanish: "el perro", english: "the dog", mastery: 0.4 },
  { id: 4, spanish: "la comida", english: "the food", mastery: 0.3 },
  { id: 5, spanish: "el agua", english: "the water", mastery: 0.5 },
  { id: 6, spanish: "el tiempo", english: "the time / weather", mastery: 0.2 },
  { id: 7, spanish: "la familia", english: "the family", mastery: 0.7 },
  { id: 8, spanish: "el trabajo", english: "the work / job", mastery: 0.4 }
];

const VocabularyPage = () => {
  const navigate = useNavigate();
  const [cards] = useState(mockVocabulary);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });

  const currentCard = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;
  const isComplete = currentIndex >= cards.length;

  const playAudio = () => {
    playElevenLabsAudio(currentCard.spanish, 'es');
  };

  const handleAnswer = (correct) => {
    setStats((prev) => ({
      ...prev,
      [correct ? "correct" : "incorrect"]: prev[correct ? "correct" : "incorrect"] + 1
    }));
    setShowAnswer(false);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setShowAnswer(false);
    setStats({ correct: 0, incorrect: 0 });
  };

  if (isComplete) {
    const accuracy = Math.round((stats.correct / cards.length) * 100);

    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card sx={{ textAlign: "center", py: 4 }}>
            <CardContent>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                🎉 Session Complete!
              </Typography>

              <Box sx={{ my: 4 }}>
                <Typography variant="h2" fontWeight={700} color="primary">
                  {accuracy}%
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  accuracy
                </Typography>
              </Box>

              <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
                <Box>
                  <Typography variant="h5" fontWeight={600} color="success.main">
                    {stats.correct}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Correct
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={600} color="error.main">
                    {stats.incorrect}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Need Review
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2} justifyContent="center">
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRestart}
                >
                  Practice Again
                </Button>
                <Button
                  variant="contained"
                  onClick={() => navigate("/practice")}
                >
                  Done
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </motion.div>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate("/practice")}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            Vocabulary Review
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Card {currentIndex + 1} of {cards.length}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`✓ ${stats.correct}`}
            size="small"
            color="success"
            variant="outlined"
          />
          <Chip
            label={`✗ ${stats.incorrect}`}
            size="small"
            color="error"
            variant="outlined"
          />
        </Stack>
      </Stack>

      {/* Progress */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ height: 8, borderRadius: 4, mb: 4 }}
      />

      {/* Flashcard */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentCard.id}
          initial={{ opacity: 0, rotateY: -90 }}
          animate={{ opacity: 1, rotateY: 0 }}
          exit={{ opacity: 0, rotateY: 90 }}
          transition={{ duration: 0.3 }}
        >
          <Card
            onClick={() => !showAnswer && setShowAnswer(true)}
            sx={{
              minHeight: 300,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              cursor: showAnswer ? "default" : "pointer",
              mb: 3
            }}
          >
            <CardContent sx={{ textAlign: "center", width: "100%" }}>
              <Typography
                variant="h3"
                fontWeight={700}
                color="primary"
                gutterBottom
              >
                {currentCard.spanish}
              </Typography>

              <IconButton onClick={playAudio} color="primary" sx={{ mb: 2 }}>
                <VolumeUpIcon />
              </IconButton>

              {showAnswer ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Typography variant="h5" sx={{ mt: 2 }}>
                    {currentCard.english}
                  </Typography>
                </motion.div>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  Tap to reveal
                </Typography>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Answer Buttons */}
      {showAnswer && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              color="error"
              size="large"
              startIcon={<CloseIcon />}
              onClick={() => handleAnswer(false)}
              sx={{ flex: 1, py: 1.5 }}
            >
              Didn't Know
            </Button>
            <Button
              variant="contained"
              color="success"
              size="large"
              startIcon={<CheckIcon />}
              onClick={() => handleAnswer(true)}
              sx={{ flex: 1, py: 1.5 }}
            >
              Got It!
            </Button>
          </Stack>
        </motion.div>
      )}
    </Container>
  );
};

export default VocabularyPage;

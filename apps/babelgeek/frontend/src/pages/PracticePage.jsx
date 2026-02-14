import { Box, Container, Typography, Card, CardContent, Grid, Button, Chip, Stack } from "@mui/material";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import MicIcon from "@mui/icons-material/Mic";
import ChatIcon from "@mui/icons-material/Chat";
import StyleIcon from "@mui/icons-material/Style";
import QuizIcon from "@mui/icons-material/Quiz";

const PracticePage = () => {
  const navigate = useNavigate();

  const practiceTypes = [
    {
      id: "conversation",
      title: "AI Conversation",
      description: "Practice speaking with an AI tutor in real-time scenarios",
      icon: <ChatIcon sx={{ fontSize: 48 }} />,
      color: "primary",
      available: true,
      path: "/practice/conversation"
    },
    {
      id: "pronunciation",
      title: "Pronunciation",
      description: "Perfect your accent with speech recognition feedback",
      icon: <MicIcon sx={{ fontSize: 48 }} />,
      color: "secondary",
      available: false
    },
    {
      id: "vocabulary",
      title: "Vocabulary Review",
      description: "Strengthen your memory with spaced repetition flashcards",
      icon: <StyleIcon sx={{ fontSize: 48 }} />,
      color: "success",
      available: true,
      stats: { due: 12, total: 45 },
      path: "/practice/vocabulary"
    },
    {
      id: "quiz",
      title: "Quick Quiz",
      description: "Test your knowledge with adaptive quizzes",
      icon: <QuizIcon sx={{ fontSize: 48 }} />,
      color: "warning",
      available: false
    }
  ];

  const handleStart = (practice) => {
    if (practice.available && practice.path) {
      navigate(practice.path);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Practice
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Choose how you want to practice your Spanish today.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {practiceTypes.map((practice) => (
            <Grid item xs={12} sm={6} key={practice.id}>
              <Card
                component={motion.div}
                whileHover={{ scale: practice.available ? 1.02 : 1 }}
                sx={{
                  height: "100%",
                  opacity: practice.available ? 1 : 0.6,
                  cursor: practice.available ? "pointer" : "not-allowed"
                }}
              >
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <Box sx={{ color: `${practice.color}.main`, mb: 2 }}>
                    {practice.icon}
                  </Box>

                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {practice.title}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                    {practice.description}
                  </Typography>

                  {practice.stats && (
                    <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                      <Chip
                        label={`${practice.stats.due} due`}
                        size="small"
                        color="warning"
                      />
                      <Chip
                        label={`${practice.stats.total} total`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  )}

                  <Button
                    variant={practice.available ? "contained" : "outlined"}
                    color={practice.color}
                    disabled={!practice.available}
                    onClick={() => handleStart(practice)}
                  >
                    {practice.available ? "Start" : "Coming Soon"}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </motion.div>
    </Container>
  );
};

export default PracticePage;

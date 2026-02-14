import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { playAudio as playElevenLabsAudio } from "../services/audioService";
import {
  Box,
  Container,
  Typography,
  Paper,
  TextField,
  IconButton,
  Stack,
  Avatar,
  Chip,
  Button
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";

const ConversationPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content: "¡Hola! Soy tu tutor de español. ¿Cómo te llamas?",
      translation: "Hello! I'm your Spanish tutor. What's your name?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showTranslations, setShowTranslations] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const playAudio = (text) => {
    playElevenLabsAudio(text, 'es');
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      role: "user",
      content: input
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response (will connect to backend)
    setTimeout(() => {
      const responses = [
        {
          content: "¡Mucho gusto! Es un placer conocerte. ¿De dónde eres?",
          translation: "Nice to meet you! It's a pleasure to meet you. Where are you from?"
        },
        {
          content: "¡Muy bien! Tu español está mejorando. ¿Qué te gusta hacer en tu tiempo libre?",
          translation: "Very good! Your Spanish is improving. What do you like to do in your free time?"
        },
        {
          content: "¡Excelente! Vamos a practicar más. ¿Cuál es tu comida favorita?",
          translation: "Excellent! Let's practice more. What's your favorite food?"
        }
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          role: "assistant",
          ...randomResponse
        }
      ]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Paper
        elevation={2}
        sx={{
          p: 2,
          borderRadius: 0,
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "background.paper"
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={() => navigate("/practice")}>
            <ArrowBackIcon />
          </IconButton>
          <Avatar sx={{ bgcolor: "primary.main" }}>
            <SmartToyIcon />
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={600}>
              AI Conversation Partner
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Practice real Spanish conversations
            </Typography>
          </Box>
          <Button
            size="small"
            variant={showTranslations ? "contained" : "outlined"}
            onClick={() => setShowTranslations(!showTranslations)}
          >
            {showTranslations ? "Hide" : "Show"} Translations
          </Button>
        </Stack>
      </Paper>

      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: "auto",
          p: 2,
          bgcolor: "grey.50"
        }}
      >
        <Container maxWidth="md">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{
                    mb: 2,
                    justifyContent: message.role === "user" ? "flex-end" : "flex-start"
                  }}
                >
                  {message.role === "assistant" && (
                    <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>
                      <SmartToyIcon fontSize="small" />
                    </Avatar>
                  )}

                  <Box sx={{ maxWidth: "70%" }}>
                    <Paper
                      elevation={1}
                      sx={{
                        p: 2,
                        bgcolor: message.role === "user" ? "primary.main" : "white",
                        color: message.role === "user" ? "white" : "text.primary",
                        borderRadius: 2,
                        borderTopLeftRadius: message.role === "assistant" ? 0 : 16,
                        borderTopRightRadius: message.role === "user" ? 0 : 16
                      }}
                    >
                      <Typography variant="body1">{message.content}</Typography>

                      {showTranslations && message.translation && (
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            pt: 1,
                            borderTop: 1,
                            borderColor: message.role === "user" ? "rgba(255,255,255,0.3)" : "divider",
                            color: message.role === "user" ? "rgba(255,255,255,0.8)" : "text.secondary",
                            fontStyle: "italic"
                          }}
                        >
                          {message.translation}
                        </Typography>
                      )}
                    </Paper>

                    {message.role === "assistant" && (
                      <IconButton
                        size="small"
                        onClick={() => playAudio(message.content)}
                        sx={{ mt: 0.5 }}
                      >
                        <VolumeUpIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>

                  {message.role === "user" && (
                    <Avatar sx={{ bgcolor: "grey.400", width: 36, height: 36 }}>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                  )}
                </Stack>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>
                <SmartToyIcon fontSize="small" />
              </Avatar>
              <Paper elevation={1} sx={{ p: 2, bgcolor: "white", borderRadius: 2 }}>
                <Stack direction="row" spacing={0.5}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -5, 0] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.2
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: "grey.400"
                        }}
                      />
                    </motion.div>
                  ))}
                </Stack>
              </Paper>
            </Stack>
          )}

          <div ref={messagesEndRef} />
        </Container>
      </Box>

      {/* Input */}
      <Paper
        elevation={3}
        sx={{
          p: 2,
          borderRadius: 0,
          position: "sticky",
          bottom: 0,
          bgcolor: "background.paper"
        }}
      >
        <Container maxWidth="md">
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <IconButton color="primary" disabled>
              <MicIcon />
            </IconButton>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Type your message in Spanish..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 3
                }
              }}
            />
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <SendIcon />
            </IconButton>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1, textAlign: "center" }}
          >
            Try responding in Spanish! The AI will help correct your mistakes.
          </Typography>
        </Container>
      </Paper>
    </Box>
  );
};

export default ConversationPage;

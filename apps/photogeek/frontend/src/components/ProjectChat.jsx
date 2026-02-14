import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Avatar,
  CircularProgress,
  Divider
} from '@mui/material';
import { Send, SmartToy, Person } from '@mui/icons-material';
import userProjectService from '../services/userProjectService';

const ProjectChat = ({ projectId, initialHistory = [] }) => {
  const [messages, setMessages] = useState(initialHistory);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Filter out system messages for display
  const displayMessages = messages.filter(msg => msg.role !== 'system');

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const userMsg = { role: 'user', content: newMessage, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setNewMessage('');
    setLoading(true);

    try {
      const updatedHistory = await userProjectService.sendChatMessage(projectId, userMsg.content);
      setMessages(updatedHistory);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Optionally handle error state here
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ height: '500px', display: 'flex', flexDirection: 'column', mt: 4 }}>
      <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToy /> AI Instructor
        </Typography>
        <Typography variant="caption">Ask for help, examples, or clarification!</Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
        <List>
          {displayMessages.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
              Start the conversation! Ask me anything about this project.
            </Typography>
          )}
          {displayMessages.map((msg, index) => (
            <ListItem key={index} sx={{
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 1
            }}>
              <Box sx={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 1,
                maxWidth: '80%'
              }}>
                <Avatar sx={{
                  bgcolor: msg.role === 'user' ? 'secondary.main' : 'primary.main',
                  width: 32, height: 32
                }}>
                  {msg.role === 'user' ? <Person fontSize="small" /> : <SmartToy fontSize="small" />}
                </Avatar>
                <Paper sx={{
                  p: 1.5,
                  bgcolor: msg.role === 'user' ? 'secondary.light' : 'white',
                  color: msg.role === 'user' ? 'white' : 'text.primary',
                  borderRadius: 2
                }}>
                  <Typography variant="body2">{msg.content}</Typography>
                </Paper>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, mx: 5 }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </ListItem>
          ))}
          {loading && (
            <ListItem sx={{ justifyContent: 'flex-start' }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  <SmartToy fontSize="small" />
                </Avatar>
                <CircularProgress size={20} />
              </Box>
            </ListItem>
          )}
          <div ref={messagesEndRef} />
        </List>
      </Box>

      <Divider />

      <Box component="form" onSubmit={handleSendMessage} sx={{ p: 2, bgcolor: 'white', display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Type your question..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <IconButton type="submit" color="primary" disabled={loading || !newMessage.trim()}>
          <Send />
        </IconButton>
      </Box>
    </Paper>
  );
};

export default ProjectChat;

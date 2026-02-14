import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  CircularProgress,
  Collapse,
  TextField,
  Button,
  Divider
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  AutoAwesome as AIIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Send as SendIcon,
  WbSunny as MorningIcon,
  Nightlight as EveningIcon,
  Psychology as CoachIcon,
  TrendingUp as TrendsIcon,
  Chat as ChatIcon
} from '@mui/icons-material';
import { insightsService } from '../../services/insightsService.js';

const AIInsightsCard = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'coaching', 'correlations', 'chat'
  const [insight, setInsight] = useState(null);
  const [expanded, setExpanded] = useState(true);

  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Determine if it's morning or evening
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 12;

  useEffect(() => {
    loadInsight(activeTab);
  }, [activeTab]);

  const loadInsight = async (type) => {
    if (type === 'chat') return; // Chat doesn't auto-load

    setLoading(true);
    setError(null);

    try {
      let data;
      switch (type) {
        case 'daily':
          data = isMorning
            ? await insightsService.getMorningBrief()
            : await insightsService.getDailySummary();
          break;
        case 'coaching':
          data = await insightsService.getCoaching();
          break;
        case 'correlations':
          data = await insightsService.getCorrelations();
          break;
        default:
          data = await insightsService.getDailySummary();
      }
      setInsight(data);
    } catch (err) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatMessage.trim() || chatLoading) return;

    const userMessage = chatMessage.trim();
    setChatMessage('');
    setChatLoading(true);

    // Add user message to history
    const newHistory = [...chatHistory, { role: 'user', content: userMessage }];
    setChatHistory(newHistory);

    try {
      const response = await insightsService.chat(userMessage, chatHistory);
      setChatHistory([...newHistory, { role: 'assistant', content: response.content }]);
    } catch (err) {
      setChatHistory([...newHistory, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const tabs = [
    { id: 'daily', label: isMorning ? 'Morning Brief' : 'Daily Summary', icon: isMorning ? MorningIcon : EveningIcon },
    { id: 'coaching', label: 'Coach', icon: CoachIcon },
    { id: 'correlations', label: 'Trends', icon: TrendsIcon },
    { id: 'chat', label: 'Ask AI', icon: ChatIcon }
  ];

  const stripFormatting = (text = '') => text.replace(/\*\*(.*?)\*\*/g, '$1');

  const renderInsightContent = (text = '') => {
    const lines = text.split('\n');
    const blocks = [];
    let currentList = null;

    const pushList = () => {
      if (currentList && currentList.length) {
        blocks.push({ type: 'list', items: currentList });
        currentList = null;
      }
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        pushList();
        blocks.push({ type: 'spacer' });
        return;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.*)/);

      if (bulletMatch || numberedMatch) {
        if (!currentList) currentList = [];
        currentList.push(stripFormatting((bulletMatch || numberedMatch)[1]));
      } else {
        pushList();
        blocks.push({ type: 'paragraph', text: stripFormatting(trimmed) });
      }
    });

    pushList();

    return blocks
      .filter(block => block.type !== 'spacer' || blocks.filter(b => b.type !== 'spacer').length)
      .map((block, idx) => {
        if (block.type === 'paragraph') {
          return (
            <Typography
              key={`p-${idx}`}
              variant="body2"
              sx={{ color: theme.palette.text.primary, lineHeight: 1.7, mb: 1 }}
            >
              {block.text}
            </Typography>
          );
        }
        if (block.type === 'list') {
          return (
            <Box
              key={`list-${idx}`}
              component="ul"
              sx={{
                pl: 3,
                mb: 1.5,
                color: theme.palette.text.primary,
                '& li': {
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  mb: 0.5
                }
              }}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{item}</li>
              ))}
            </Box>
          );
        }
        return <Box key={`spacer-${idx}`} sx={{ height: 8 }} />;
      });
  };

  const accentColor = theme.palette.primary.main;

  return (
    <Card sx={{
      borderRadius: 2.5,
      boxShadow: 'none',
      border: `1px solid ${theme.palette.divider}`,
      overflow: 'hidden',
    }}>
      <CardContent sx={{ p: 0 }}>
        {/* Header — compact */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 2.5 },
          py: 1.25,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon sx={{ color: theme.palette.text.secondary, fontSize: 18 }} />
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.625rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.palette.text.secondary,
              }}
            >
              AI Insights
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={() => loadInsight(activeTab)}
              disabled={loading || activeTab === 'chat'}
              sx={{ p: 0.5 }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ p: 0.5 }}>
              {expanded ? <CollapseIcon sx={{ fontSize: 16 }} /> : <ExpandIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>
        </Box>

        {/* Tab Chips — smaller */}
        <Box sx={{
          display: 'flex',
          gap: 0.75,
          px: { xs: 1.5, sm: 2.5 },
          pb: 1.25,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
        }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Chip
                key={tab.id}
                icon={<Icon sx={{ fontSize: 14 }} />}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
                size="small"
                sx={{
                  borderRadius: 1.5,
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                  height: 28,
                  backgroundColor: isActive
                    ? isDark ? 'rgba(13, 148, 136, 0.15)' : 'rgba(13, 148, 136, 0.08)'
                    : 'transparent',
                  color: isActive ? accentColor : theme.palette.text.secondary,
                  border: `1px solid ${isActive ? accentColor : theme.palette.divider}`,
                  '&:hover': {
                    backgroundColor: isActive
                      ? isDark ? 'rgba(13, 148, 136, 0.2)' : 'rgba(13, 148, 136, 0.12)'
                      : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  },
                }}
              />
            );
          })}
        </Box>

        <Collapse in={expanded}>
          <Divider />

          {/* Content Area */}
          <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, minHeight: 60 }}>
            {activeTab === 'chat' ? (
              /* Chat Interface */
              <Box>
                <Box sx={{
                  maxHeight: 180,
                  overflowY: 'auto',
                  mb: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}>
                  {chatHistory.length === 0 ? (
                    <Typography sx={{ color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.8125rem' }}>
                      Ask about your health data...
                    </Typography>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          px: 1.5,
                          py: 1,
                          borderRadius: 2,
                          backgroundColor: msg.role === 'user'
                            ? isDark ? 'rgba(13, 148, 136, 0.15)' : 'rgba(13, 148, 136, 0.08)'
                            : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          border: `1px solid ${theme.palette.divider}`,
                        }}
                      >
                        <Typography sx={{
                          color: theme.palette.text.primary,
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.8125rem',
                        }}>
                          {msg.content}
                        </Typography>
                      </Box>
                    ))
                  )}
                  {chatLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={14} />
                      <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.75rem' }}>
                        Thinking...
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask about your health data..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                    disabled={chatLoading}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        fontSize: '0.8125rem',
                      },
                    }}
                  />
                  <IconButton
                    onClick={handleSendChat}
                    disabled={!chatMessage.trim() || chatLoading}
                    size="small"
                    sx={{ p: 0.75 }}
                  >
                    <SendIcon sx={{ fontSize: 18, color: chatMessage.trim() ? accentColor : theme.palette.text.disabled }} />
                  </IconButton>
                </Box>
              </Box>
            ) : loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={18} sx={{ color: accentColor }} />
                <Typography sx={{ ml: 1.5, color: theme.palette.text.secondary, fontSize: '0.8125rem' }}>
                  Analyzing...
                </Typography>
              </Box>
            ) : error ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: theme.palette.error.main, fontSize: '0.8125rem', mb: 0.5 }}>
                  {error}
                </Typography>
                <Button
                  size="small"
                  onClick={() => loadInsight(activeTab)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Try Again
                </Button>
              </Box>
            ) : insight ? (
              <Box>
                {renderInsightContent(insight.content)}
                <Typography
                  sx={{
                    display: 'block',
                    mt: 1,
                    color: theme.palette.text.disabled,
                    fontSize: '0.625rem',
                  }}
                >
                  Generated {new Date(insight.generatedAt).toLocaleTimeString()}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem' }}>
                  Click refresh to generate insights
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default AIInsightsCard;

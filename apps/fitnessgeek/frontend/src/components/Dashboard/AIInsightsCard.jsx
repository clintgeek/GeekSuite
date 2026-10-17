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
import { errorMessage } from '../../utils/errorMessage.js';
import { AINoteFooter, AI_NOTES_NAME, lastDaysSource } from '../Reports/aiNotes.jsx';

/**
 * The sentence the backend sends with `ok: false`. Kept here as the local
 * default for the rare case a response omits it — never assembled from an
 * HTTP status or a provider name, neither of which is the user's business.
 */
const UNAVAILABLE_TEXT = 'The assistant isn’t available right now.';

/**
 * What each kind of note was written from, for its footer (D-11). The
 * server's own `context.daysAnalyzed` wins when it sends one; otherwise the
 * window each generator reads (aiInsightsService: the brief and summary read
 * since yesterday, coaching 14 days, patterns 30).
 */
export function noteSource(insight) {
  const n = Number(insight?.context?.daysAnalyzed);
  switch (insight?.type) {
    case 'morning_brief': return 'from yesterday’s logs';
    case 'daily_summary': return 'from today’s logs';
    case 'coaching': return lastDaysSource(Number.isFinite(n) && n > 0 ? n : 14);
    case 'correlations': return lastDaysSource(Number.isFinite(n) && n > 0 ? n : 30);
    default: return Number.isFinite(n) && n > 0 ? lastDaysSource(n) : 'from your logs';
  }
}

const AIInsightsCard = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'coaching', 'correlations', 'chat'
  const [insight, setInsight] = useState(null);
  // Collapsed by default, and NOTHING is fetched until it's opened (Chef,
  // 2026-09-27: "hide the AI INSIGHTS and don't pull them unless you expand
  // its container"). Every Home load used to spend an AI call here.
  const [expanded, setExpanded] = useState(false);

  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Determine if it's morning or evening
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 12;

  useEffect(() => {
    if (expanded) loadInsight(activeTab);
  }, [activeTab, expanded]); // eslint-disable-line react-hooks/exhaustive-deps -- loadInsight is recreated each render

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
      // `ok: false` is the assistant saying "not right now" — a 200 with a
      // sentence to show, not an error. Rendering it through `error` would
      // put a red line and a Try Again button in front of a normal, expected
      // condition (the free tier having a day, or the daily cap being hit).
      // The `error` branch is now only for a genuinely broken request.
      setInsight(data);
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t load these notes. Try again.'));
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
      // The coach has no deterministic fallback, so an unavailable model comes
      // back as `{ ok: false, message }` at HTTP 200. Show that sentence in
      // the thread; it says what happened without naming an API.
      setChatHistory([...newHistory, {
        role: 'assistant',
        content: response?.ok === false
          ? (response.message || UNAVAILABLE_TEXT)
          : response.content
      }]);
    } catch (err) {
      setChatHistory([...newHistory, { role: 'assistant', content: errorMessage(err, 'I couldn’t answer that just now. Try again.') }]);
    } finally {
      setChatLoading(false);
    }
  };

  const tabs = [
    { id: 'daily', label: isMorning ? 'This morning' : 'Today', icon: isMorning ? MorningIcon : EveningIcon },
    { id: 'coaching', label: 'Advice', icon: CoachIcon },
    { id: 'correlations', label: 'Patterns', icon: TrendsIcon },
    { id: 'chat', label: 'Ask', icon: ChatIcon }
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
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: '0.875rem',
                color: theme.palette.text.secondary,
              }}
            >
              {AI_NOTES_NAME}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={() => loadInsight(activeTab)}
              disabled={!expanded || loading || activeTab === 'chat'}
              aria-label={`Refresh ${tabs.find((t) => t.id === activeTab)?.label || 'notes'}`}
              sx={{ p: 0.5 }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Hide notes from the AI' : 'Show notes from the AI'}
              aria-expanded={expanded}
              sx={{ p: 0.5 }}
            >
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
                onClick={() => { setActiveTab(tab.id); setExpanded(true); }}
                size="small"
                sx={{
                  borderRadius: 1.5,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  height: { xs: 44, sm: 32 },
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
                      Ask about your food, weight or sleep…
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
                        Thinking…
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask about your food, weight or sleep…"
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
                    aria-label="Send your question"
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
                  Reading your logs…
                </Typography>
              </Box>
            ) : error ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography data-testid="ai-notes-error" sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem', mb: 0.5 }}>
                  {error}
                </Typography>
                <Button
                  size="small"
                  onClick={() => loadInsight(activeTab)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 44 }}
                >
                  Try again
                </Button>
              </Box>
            ) : insight?.ok === false ? (
              /* Not an error: the assistant is unavailable and said so. One
                 line, in place, with a retry — no red text, no toast. */
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem', mb: 0.5 }}>
                  {insight.message || UNAVAILABLE_TEXT}
                </Typography>
                <Button
                  size="small"
                  onClick={() => loadInsight(activeTab)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 44 }}
                >
                  Try again
                </Button>
              </Box>
            ) : insight?.content ? (
              <Box>
                {renderInsightContent(insight.content)}
                <AINoteFooter source={noteSource(insight)} generatedAt={insight.generatedAt} sx={{ mt: 1 }} />
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.8125rem' }}>
                  Nothing here yet. Tap refresh to try again.
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

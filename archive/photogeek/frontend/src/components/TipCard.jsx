import { Box, Typography, Chip } from '@mui/material';
import ReactMarkdown from 'react-markdown';

const TipCard = ({ tip, index }) => {
  // Check if this is a special tip type for subtle visual distinction
  const isExplainedTip = tip.includes('**') && tip.includes('Explained');
  const isProTip = tip.includes('**Pro Tip**');

  return (
    <Box
      sx={{
        mb: 2,
        pl: 2,
        borderLeft: '3px solid',
        borderColor: isProTip ? 'secondary.main' : isExplainedTip ? 'primary.main' : 'grey.300',
      }}
    >
      {(isProTip || isExplainedTip) && (
        <Chip
          label={isProTip ? 'Pro Tip' : 'Key Concept'}
          size="small"
          sx={{
            mb: 1,
            height: 20,
            fontSize: '0.7rem',
            bgcolor: isProTip ? 'secondary.light' : 'primary.light',
            color: isProTip ? 'secondary.dark' : 'primary.dark',
          }}
        />
      )}
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0, lineHeight: 1.6 }}>
              {children}
            </Typography>
          ),
          strong: ({ children }) => (
            <Typography
              component="span"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
              }}
            >
              {children}
            </Typography>
          ),
        }}
      >
        {tip}
      </ReactMarkdown>
    </Box>
  );
};

export default TipCard;

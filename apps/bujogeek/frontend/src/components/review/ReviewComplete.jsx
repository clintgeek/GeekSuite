import { Box, Typography, Button } from '@mui/material';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../theme/colors';

const ReviewComplete = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 10,
        px: 3,
        textAlign: 'center',
      }}
    >
      <CheckCircle2
        size={48}
        color={colors.aging.fresh}
        strokeWidth={1.5}
        style={{ marginBottom: 16, opacity: 0.7 }}
      />
      <Typography
        variant="h2"
        sx={{
          color: colors.ink[800],
          mb: 1,
        }}
      >
        All caught up
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: colors.ink[400],
          maxWidth: 320,
          mb: 4,
        }}
      >
        You've reviewed all aging tasks. Nice work.
      </Typography>
      <Button
        variant="outlined"
        onClick={() => navigate('/today')}
        sx={{
          color: colors.primary[500],
          borderColor: colors.primary[200],
          '&:hover': {
            borderColor: colors.primary[500],
            backgroundColor: colors.primary[50],
            transform: 'none',
          },
        }}
      >
        Back to Today
      </Button>
    </Box>
  );
};

export default ReviewComplete;

import { Box, Typography, LinearProgress } from '@mui/material';
import { colors } from '../../theme/colors';

const ReviewProgress = ({ total, reviewed }) => {
  const allDone = reviewed >= total;
  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="body2"
        sx={{
          color: allDone ? colors.aging.fresh : colors.ink[500],
          fontWeight: 500,
          mb: 0.75,
        }}
      >
        {allDone
          ? 'All caught up!'
          : `${reviewed} of ${total} reviewed`
        }
      </Typography>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.ink[100],
          '& .MuiLinearProgress-bar': {
            borderRadius: 2,
            backgroundColor: allDone ? colors.aging.fresh : colors.primary[500],
            transition: 'transform 0.4s ease, background-color 0.3s ease',
          },
        }}
      />
    </Box>
  );
};

export default ReviewProgress;

import { Box, keyframes, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

/**
 * SkeletonLoader — planner-page shimmer.
 *
 * Uses a warm parchment gradient sweep instead of MUI's default grey
 * pulse. Matches task-row layout (checkbox circle + two text lines) so
 * the skeleton doesn't pop when real content replaces it.
 */
const shimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const SkeletonBar = ({ width, height = 12, borderRadius = 4, isDark, sx = {} }) => {
  const bg = isDark
    ? 'linear-gradient(90deg, rgba(255,255,255,0.09) 25%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.09) 75%)'
    : `linear-gradient(90deg, ${colors.ink[100]} 25%, ${colors.parchment.warm} 50%, ${colors.ink[100]} 75%)`;

  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: `${borderRadius}px`,
        backgroundImage: bg,
        backgroundSize: '200% 100%',
        animation: `${shimmer} 1.8s ease-in-out infinite`,
        ...sx,
      }}
    />
  );
};

const TaskRowSkeleton = ({ index = 0, isDark }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 1.5,
      py: 1.25,
      px: 2,
    }}
  >
    <SkeletonBar width={24} height={24} borderRadius={12} isDark={isDark} sx={{ flexShrink: 0, mt: 0.25 }} />
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75, pt: 0.25 }}>
      <SkeletonBar width={`${55 + (index % 3) * 12}%`} height={14} isDark={isDark} />
      <SkeletonBar width={`${25 + (index % 2) * 10}%`} height={10} isDark={isDark} />
    </Box>
  </Box>
);

const SkeletonLoader = ({ rows = 5 }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <TaskRowSkeleton key={i} index={i} isDark={isDark} />
      ))}
    </Box>
  );
};

export default SkeletonLoader;

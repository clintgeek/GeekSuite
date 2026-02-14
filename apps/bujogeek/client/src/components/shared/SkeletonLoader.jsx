import { Box, Skeleton } from '@mui/material';

const TaskRowSkeleton = () => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      py: 1.25,
      px: 2,
    }}
  >
    <Skeleton variant="circular" width={24} height={24} />
    <Box sx={{ flex: 1 }}>
      <Skeleton variant="text" width="60%" height={20} />
      <Skeleton variant="text" width="30%" height={16} />
    </Box>
  </Box>
);

const SkeletonLoader = ({ rows = 5 }) => {
  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </Box>
  );
};

export default SkeletonLoader;

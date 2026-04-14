import React from 'react';
import { Box, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Surface from './Surface';

/**
 * SurfaceSkeleton — a layout-preserving loading state.
 *
 * Instead of an indeterminate spinner that tells you nothing, this renders
 * the approximate shape of the content that's coming: a title skeleton
 * followed by a number of row skeletons.
 *
 * Perceived performance > actual performance.
 */
const SurfaceSkeleton = ({
  rows = 3,
  showHeader = true,
  height = 'auto',
  variant = 'card',
}) => {
  return (
    <Surface variant={variant} sx={{ minHeight: height === 'auto' ? undefined : height }}>
      {showHeader && (
        <Box sx={{ mb: 2.5 }}>
          <Skeleton variant="text" width={120} height={16} sx={{ mb: 1, borderRadius: 1 }} />
          <Skeleton variant="text" width="60%" height={32} sx={{ borderRadius: 1 }} />
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Box
            key={i}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Skeleton variant="text" height={24} sx={{ borderRadius: 1 }} />
            <Skeleton variant="text" width={56} height={24} sx={{ borderRadius: 1 }} />
          </Box>
        ))}
      </Box>
    </Surface>
  );
};

export default SurfaceSkeleton;

/**
 * Panel — a section of the Signal Box: a screwed-down card with a brass plate
 * for a title. The card chrome (bevel, grain, screws) is the theme's
 * `MuiCard` override; this adds the plate, an optional caption and a slot for
 * actions on the right.
 */
import { Box, Card, CardContent, Typography } from '@mui/material';
import { BrassPlate } from './Labels';

export default function Panel({
  title,
  number,
  caption,
  actions,
  children,
  headingComponent = 'h2',
  id,
  sx,
  contentSx,
  ...rest
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Card component="section" aria-labelledby={headingId} id={id} sx={sx} {...rest}>
      <CardContent sx={contentSx}>
        {(title || actions) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: caption ? 0.75 : 2 }}>
            {title && (
              <BrassPlate number={number} component={headingComponent} id={headingId}>
                {title}
              </BrassPlate>
            )}
            <Box sx={{ flexGrow: 1 }} />
            {actions}
          </Box>
        )}
        {caption && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {caption}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

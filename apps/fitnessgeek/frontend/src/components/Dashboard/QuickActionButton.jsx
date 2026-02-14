import { Button, Tooltip, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';

export default function QuickActionButton({ icon: Icon, label, to, color = 'primary', variant = 'contained', compact = false }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isNarrow = useMediaQuery('(max-width:400px)');
  const showIconOnly = compact && isNarrow;
  const IconComponent = Icon;

  const button = (
    <Button
      variant={variant}
      color={color}
      size={showIconOnly ? 'medium' : 'large'}
      onClick={() => navigate(to)}
      sx={{
        borderRadius: 2,
        padding: showIconOnly ? '10px' : { xs: '8px 16px', sm: '10px 20px' },
        minWidth: { xs: 44, sm: 'auto' },
        minHeight: { xs: 40, sm: 38 },
        fontSize: '0.8125rem',
        fontWeight: 700,
        textTransform: 'none',
        boxShadow: 'none',
        ...(variant === 'contained' && {
          backgroundColor: theme.palette.primary.main,
          color: '#fff',
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
            boxShadow: 'none',
          },
        }),
        ...(variant === 'outlined' && {
          borderColor: theme.palette.divider,
          color: theme.palette.text.primary,
          '&:hover': {
            borderColor: theme.palette.primary.main,
            backgroundColor: 'transparent',
          },
        }),
      }}
      startIcon={showIconOnly ? undefined : <IconComponent sx={{ fontSize: 20 }} />}
    >
      {showIconOnly ? <IconComponent sx={{ fontSize: 20 }} /> : label}
    </Button>
  );

  return showIconOnly ? (
    <Tooltip title={label}>
      {button}
    </Tooltip>
  ) : button;
}

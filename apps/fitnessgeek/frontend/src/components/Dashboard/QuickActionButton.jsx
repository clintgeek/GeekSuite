import { Button, Tooltip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';

export default function QuickActionButton({ icon: Icon, label, to, color = 'primary', variant = 'contained', compact = false }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const IconComponent = Icon;

  const button = (
    <Button
      variant={variant}
      color={color}
      size="large"
      onClick={() => navigate(to)}
      sx={{
        borderRadius: 2,
        padding: compact ? { xs: '8px 10px', sm: '10px 20px' } : { xs: '8px 16px', sm: '10px 20px' },
        minWidth: 44,
        minHeight: 44,
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
      startIcon={<IconComponent sx={{ fontSize: 20 }} />}
    >
      {label}
    </Button>
  );

  // The tooltip is a bonus on pointer devices, never the only label: the text
  // is in the button (MOBILE_UI_PLAN.md §2 "Hover").
  return <Tooltip title={label}>{button}</Tooltip>;
}

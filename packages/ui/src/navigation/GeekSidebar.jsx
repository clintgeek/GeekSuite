import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { geekLayout } from '../designTokens.js';

export const GeekSidebar = forwardRef(function GeekSidebar(
  {
    appName,
    items = [],
    activeId,
    onNavigate,
    footer,
    mobileOpen = false,
    onMobileClose,
    variant = 'permanent',
    sx,
    ...props
  },
  ref
) {
  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {appName ? (
        <Toolbar sx={{ minHeight: `${geekLayout.topBarHeight}px !important`, px: 2 }}>
          <Typography variant="h3" noWrap>
            {appName}
          </Typography>
        </Toolbar>
      ) : null}
      <List sx={{ px: 1, py: 1, flex: 1 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.id}
            selected={item.id === activeId}
            disabled={item.disabled}
            onClick={(event) => onNavigate?.(item, event)}
          >
            {item.icon ? <ListItemIcon>{item.icon}</ListItemIcon> : null}
            <ListItemText
              primary={item.label}
              secondary={item.description}
              primaryTypographyProps={{ noWrap: true }}
            />
          </ListItemButton>
        ))}
      </List>
      {footer ? <Box sx={{ p: 2 }}>{footer}</Box> : null}
    </Box>
  );

  if (variant === 'temporary') {
    return (
      <Drawer
        ref={ref}
        open={mobileOpen}
        onClose={onMobileClose}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': { width: geekLayout.sidebarWidth },
          ...sx,
        }}
        {...props}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Drawer
      ref={ref}
      variant="permanent"
      sx={{
        width: geekLayout.sidebarWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: geekLayout.sidebarWidth,
          boxSizing: 'border-box',
        },
        ...sx,
      }}
      {...props}
    >
      {content}
    </Drawer>
  );
});


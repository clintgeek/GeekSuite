import { useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Container,
} from '@mui/material';
import { CameraAlt, Menu as MenuIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <AppBar position="static">
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          {/* Logo */}
          <CameraAlt sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }} />
          <Typography
            variant="h6"
            noWrap
            component="a"
            onClick={() => navigate('/')}
            sx={{
              mr: 4,
              display: { xs: 'none', md: 'flex' },
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '.1rem',
              color: 'inherit',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            PhotoGeek
          </Typography>

          {/* Mobile Menu (simplified for now) */}
          <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              size="large"
              aria-label="menu"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              color="inherit"
            >
              <MenuIcon />
            </IconButton>
          </Box>

          {/* Desktop Navigation */}
          <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 2 }}>
            <Button
              onClick={() => navigate('/')}
              sx={{
                my: 2,
                color: 'white',
                display: 'block',
                borderBottom: isActive('/') ? '2px solid white' : 'none',
                borderRadius: 0,
              }}
            >
              Dashboard
            </Button>
            <Button
              onClick={() => navigate('/projects')}
              sx={{
                my: 2,
                color: 'white',
                display: 'block',
                borderBottom: isActive('/projects') ? '2px solid white' : 'none',
                borderRadius: 0,
              }}
            >
              Projects
            </Button>
          </Box>

          {/* User Menu */}
          <Box sx={{ flexGrow: 0 }}>
            <Button
              onClick={handleMenu}
              sx={{ p: 0, color: 'inherit', textTransform: 'none' }}
              endIcon={<Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>{user?.profile?.firstName?.[0] || 'U'}</Avatar>}
            >
              <Typography variant="body1" sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}>
                {user?.profile?.firstName}
              </Typography>
            </Button>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              open={Boolean(anchorEl)}
              onClose={handleClose}
            >
              <MenuItem onClick={() => { handleClose(); navigate('/'); }}>Dashboard</MenuItem>
              <MenuItem onClick={() => { handleClose(); navigate('/projects'); }}>Projects</MenuItem>
              <MenuItem onClick={handleLogout}>Logout</MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Header;

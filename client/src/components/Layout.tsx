import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SportsTennisIcon from '@mui/icons-material/SportsTennis';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);

  const nav = [
    { to: '/', label: 'Home' },
    { to: '/record', label: 'Record match' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: `/players/${user!.id}`, label: 'My profile' },
    { to: '/account', label: 'Account' },
    ...(user!.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          {compact && (
            <IconButton color="inherit" edge="start" aria-label="Open menu" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <SportsTennisIcon />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            noWrap
            sx={{ textDecoration: 'none', mr: 2, fontSize: { xs: '1.05rem', sm: '1.25rem' } }}
          >
            Ping Pong Ladder
          </Typography>
          {!compact &&
            nav.map((n) => (
              <Button
                key={n.to}
                component={RouterLink}
                to={n.to}
                color="inherit"
                sx={{ fontWeight: pathname === n.to ? 700 : 400, textDecoration: pathname === n.to ? 'underline' : 'none' }}
              >
                {n.label}
              </Button>
            ))}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" noWrap sx={{ mr: compact ? 0 : 1 }}>
            {compact ? user!.rating : `${user!.display_name} · ${user!.rating}`}
          </Typography>
          {!compact && (
            <Button color="inherit" onClick={logout}>
              Sign out
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Drawer open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 260 }} role="navigation">
          <Box sx={{ p: 2 }}>
            <Typography fontWeight={600}>{user!.display_name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Rating {user!.rating}
            </Typography>
          </Box>
          <Divider />
          <List>
            {nav.map((n) => (
              <ListItemButton
                key={n.to}
                component={RouterLink}
                to={n.to}
                selected={pathname === n.to}
                onClick={() => setOpen(false)}
              >
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <List>
            <ListItemButton
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              <ListItemText primary="Sign out" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Container maxWidth="md" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 3 } }}>
        <Outlet />
      </Container>
    </>
  );
}

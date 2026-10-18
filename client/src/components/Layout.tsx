import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import SportsTennisIcon from '@mui/icons-material/SportsTennis';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = [
    { to: '/', label: 'Home' },
    { to: '/record', label: 'Record match' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: `/players/${user!.id}`, label: 'My profile' },
  ];

  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <SportsTennisIcon />
          <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', mr: 2 }}>
            Ping Pong Ladder
          </Typography>
          {nav.map((n) => (
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
          <Typography variant="body2" sx={{ mr: 1 }}>
            {user!.display_name} · {user!.rating}
          </Typography>
          <Button color="inherit" onClick={logout}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}

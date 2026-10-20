import { Alert, Box, Button, Card, CardContent, Divider, Snackbar, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type Match } from '../api/client';
import MatchRow from '../components/MatchRow';
import PendingMatchCard from '../components/PendingMatchCard';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ awaiting_me: Match[]; awaiting_them: Match[] } | null>(null);
  const [recent, setRecent] = useState<Match[]>([]);
  const [flash, setFlash] = useState<string | null>((location.state as { flash?: string } | null)?.flash ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api.pending(), api.recent()]);
      setPending(p);
      setRecent(r);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    if (location.state) navigate('.', { replace: true, state: null });
  }, [load, location.state, navigate]);

  const onChanged = (msg: string) => {
    setFlash(msg);
    load();
    refresh(); // rating in header
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5">Hi {user!.display_name?.split(' ')[0]}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/record">
          Record match
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Needs your confirmation
          </Typography>
          {pending && pending.awaiting_me.length === 0 && (
            <Typography color="text.secondary">Nothing to confirm.</Typography>
          )}
          {pending?.awaiting_me.map((m) => (
            <PendingMatchCard key={m.id} match={m} userId={user!.id} onChanged={onChanged} />
          ))}
        </CardContent>
      </Card>

      {pending && pending.awaiting_them.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Waiting on opponents
            </Typography>
            {pending.awaiting_them.map((m) => (
              <PendingMatchCard key={m.id} match={m} userId={user!.id} onChanged={onChanged} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent matches
          </Typography>
          {recent.length === 0 && <Typography color="text.secondary">No confirmed matches yet.</Typography>}
          {recent.map((m, i) => (
            <Box key={m.id}>
              {i > 0 && <Divider />}
              <MatchRow match={m} viewerId={user!.id} onVoided={() => onChanged('Judged result voided')} />
            </Box>
          ))}
        </CardContent>
      </Card>

      <Snackbar open={!!flash} autoHideDuration={4000} onClose={() => setFlash(null)}>
        <Alert severity="success" onClose={() => setFlash(null)} variant="filled">
          {flash}
        </Alert>
      </Snackbar>
    </Box>
  );
}

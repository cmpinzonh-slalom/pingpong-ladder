import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, type TournamentSummary } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { formatLabel } from '../lib/format';

export function StatusChip({ t }: { t: TournamentSummary }) {
  if (t.status === 'signup') {
    return t.signup_open ? (
      <Chip size="small" color="success" label="Sign-up open" />
    ) : (
      <Chip size="small" color="warning" label="Sign-up closed" />
    );
  }
  if (t.status === 'in_progress') return <Chip size="small" color="primary" label="In progress" />;
  if (t.status === 'completed') return <Chip size="small" label="Completed" />;
  return <Chip size="small" variant="outlined" label="Cancelled" />;
}

function TournamentCard({ t }: { t: TournamentSummary }) {
  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardActionArea component={RouterLink} to={`/tournaments/${t.id}`}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="h6">{t.name}</Typography>
            <StatusChip t={t} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {dayjs(t.starts_on).format('ddd, MMM D, YYYY')} · {formatLabel(t.best_of)} · {t.entrant_count}
            {t.max_players ? `/${t.max_players}` : ''} players
            {t.entered && ' · You’re in'}
          </Typography>
          {t.status === 'signup' && t.signup_open && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Sign up by {dayjs(t.signup_deadline).format('MMM D, h:mm A')}
            </Typography>
          )}
          {t.status === 'completed' && t.winner_name && (
            <Typography variant="body2" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <EmojiEventsIcon fontSize="small" color="warning" /> {t.winner_name}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function TournamentsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .tournaments()
      .then(setList)
      .catch((err) => setError(err.message));
  }, []);

  const groups: [string, TournamentSummary[]][] = [
    ['Open for sign-up', (list ?? []).filter((t) => t.status === 'signup')],
    ['In progress', (list ?? []).filter((t) => t.status === 'in_progress')],
    ['Completed', (list ?? []).filter((t) => t.status === 'completed' || t.status === 'cancelled')],
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5">Tournaments</Typography>
        {user!.is_admin && (
          <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/tournaments/new">
            New tournament
          </Button>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {list && list.length === 0 && <Typography color="text.secondary">No tournaments yet.</Typography>}
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <Box key={title}>
            <Typography variant="h6" gutterBottom>
              {title}
            </Typography>
            {items.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </Box>
        ))}
    </Box>
  );
}

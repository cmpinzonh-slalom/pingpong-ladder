import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import BlockIcon from '@mui/icons-material/Block';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, ratingChange, type Match } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  match: Match;
  /** If a participant, the row is shown from their perspective (rating change chip). */
  viewerId?: number;
  /** Called after an admin voids this (judged) match, so the list can reload. */
  onVoided?: () => void;
}

/** One-line summary of a match. */
export default function MatchRow({ match: m, viewerId, onVoided }: Props) {
  const { user, refresh } = useAuth();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participant = viewerId !== undefined && (m.player_a.id === viewerId || m.player_b.id === viewerId);
  const winner = m.winner_id === m.player_a.id ? m.player_a : m.player_b;
  const loser = m.winner_id === m.player_a.id ? m.player_b : m.player_a;
  const winnerIsA = winner.id === m.player_a.id;
  const games = m.games.map((g) => (winnerIsA ? `${g.a}-${g.b}` : `${g.b}-${g.a}`)).join(', ');
  const delta = participant ? ratingChange(m, viewerId!) : null;
  const winnerDelta =
    m.rating_a_after != null && m.rating_a_before != null ? Math.abs(m.rating_a_after - m.rating_a_before) : null;
  const canVoid = !!user?.is_admin && !!m.judged_by && !m.tournament && m.status === 'confirmed' && !!onVoided;

  const doVoid = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.voidMatch(m.id);
      setConfirmVoid(false);
      // If the admin played in this match, their own rating changed: refresh the signed-in user
      // so the header matches the reloaded page (on every page that shows MatchRow).
      if (user && (m.player_a.id === user.id || m.player_b.id === user.id)) await refresh();
      onVoided?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, flexWrap: 'wrap' }}>
      <Typography component="div" sx={{ flex: 1, minWidth: 220 }}>
        <Link component={RouterLink} to={`/players/${winner.id}`} fontWeight={600} underline="hover">
          {winner.name}
        </Link>{' '}
        beat{' '}
        <Link component={RouterLink} to={`/players/${loser.id}`} underline="hover">
          {loser.name}
        </Link>
        <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
          {games}
        </Typography>
        {m.tournament && (
          <Link
            component={RouterLink}
            to={`/tournaments/${m.tournament.id}`}
            variant="caption"
            sx={{ display: 'block' }}
            underline="hover"
            color="secondary"
          >
            {m.tournament.name} · {m.tournament.round_name}
          </Link>
        )}
        {m.judged_by && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <GavelIcon sx={{ fontSize: 14 }} /> Judged by {m.judged_by.name}
          </Typography>
        )}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {dayjs(m.played_at).format('MMM D')}
      </Typography>
      {delta !== null ? (
        <Chip size="small" color={delta >= 0 ? 'success' : 'error'} label={`${delta >= 0 ? '+' : ''}${delta}`} />
      ) : (
        winnerDelta !== null && <Chip size="small" variant="outlined" label={`±${winnerDelta}`} />
      )}
      {canVoid && (
        <Tooltip title="Void judged result">
          <IconButton size="small" aria-label="Void judged result" onClick={() => setConfirmVoid(true)}>
            <BlockIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Dialog open={confirmVoid} onClose={() => setConfirmVoid(false)}>
        <DialogTitle>Void this judged result?</DialogTitle>
        <DialogContent>
          <Typography>
            {winner.name} beat {loser.name} ({games}), judged by {m.judged_by?.name}. The match will be removed and both
            players' rating changes reversed. The reversal appears in their rating history.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmVoid(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={busy} onClick={doVoid}>
            Void result
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

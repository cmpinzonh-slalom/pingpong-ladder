import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, gamesFor, opponentOf, type Match } from '../api/client';
import { summarize } from '../lib/scores';
import GameScoresInput, { fromGames, toGames, type GameDraft } from './GameScoresInput';

interface Props {
  match: Match;
  userId: number;
  onChanged: (message: string) => void;
}

/** A pending match, with actions depending on whether it's waiting on the viewer. */
export default function PendingMatchCard({ match: m, userId, onChanged }: Props) {
  const opp = opponentOf(m, userId);
  const mine = gamesFor(m, userId);
  const iWon = m.winner_id === userId;
  const awaitingMe = m.awaiting_user_id === userId;
  const isCounter = m.parent_match_id !== null;

  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GameDraft[]>(fromGames(mine));

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
      onChanged(msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const myGames = mine.filter((g) => g.me > g.them).length;
  const theirGames = mine.length - myGames;

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography fontWeight={600}>
            {iWon ? 'You beat' : 'You lost to'} {opp.name} {myGames}–{theirGames}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {dayjs(m.played_at).format('ddd, MMM D')}
          </Typography>
        </Box>
        {m.tournament && (
          <Chip
            size="small"
            color="secondary"
            variant="outlined"
            label={`${m.tournament.name} · ${m.tournament.round_name}`}
            sx={{ mt: 0.5 }}
          />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {mine.map((g) => `${g.me}-${g.them}`).join(', ')}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {awaitingMe
            ? `${opp.name} ${isCounter ? 'proposed a correction' : 'recorded this result'}. Is it right?`
            : `Waiting for ${opp.name} to confirm.`}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {awaitingMe && (
            <>
              <Button
                variant="contained"
                color="success"
                disabled={busy}
                onClick={() => run(() => api.confirm(m.id), 'Result confirmed, ratings updated')}
              >
                Confirm
              </Button>
              <Button variant="outlined" disabled={busy} onClick={() => setEditing(true)}>
                Propose correction
              </Button>
            </>
          )}
          <Button
            color="inherit"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Withdraw this match? It will be discarded for both players.')) {
                run(() => api.withdraw(m.id), 'Match withdrawn');
              }
            }}
          >
            Withdraw
          </Button>
        </Box>
      </CardContent>

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="xs" fullScreen={fullScreen}>
        <DialogTitle>Correct the result vs {opp.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {opp.name} will be asked to confirm your version.
          </Typography>
          <GameScoresInput value={draft} onChange={setDraft} opponentName={opp.name.split(' ')[0]} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy || !summarize(toGames(draft)).ok}
            onClick={() => run(() => api.counter(m.id, toGames(draft)), `Correction sent to ${opp.name}`)}
          >
            Send correction
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

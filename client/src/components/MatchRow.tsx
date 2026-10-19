import { Box, Chip, Link, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { Link as RouterLink } from 'react-router-dom';
import { ratingChange, type Match } from '../api/client';

/** One-line summary of a match. If `viewerId` is a participant, shown from their perspective. */
export default function MatchRow({ match: m, viewerId }: { match: Match; viewerId?: number }) {
  const participant = viewerId !== undefined && (m.player_a.id === viewerId || m.player_b.id === viewerId);
  const winner = m.winner_id === m.player_a.id ? m.player_a : m.player_b;
  const loser = m.winner_id === m.player_a.id ? m.player_b : m.player_a;
  const winnerIsA = winner.id === m.player_a.id;
  const games = m.games.map((g) => (winnerIsA ? `${g.a}-${g.b}` : `${g.b}-${g.a}`)).join(', ');
  const delta = participant ? ratingChange(m, viewerId!) : null;
  const winnerDelta =
    m.rating_a_after != null && m.rating_a_before != null ? Math.abs(m.rating_a_after - m.rating_a_before) : null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, flexWrap: 'wrap' }}>
      <Typography sx={{ flex: 1, minWidth: 220 }}>
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
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {dayjs(m.played_at).format('MMM D')}
      </Typography>
      {delta !== null ? (
        <Chip size="small" color={delta >= 0 ? 'success' : 'error'} label={`${delta >= 0 ? '+' : ''}${delta}`} />
      ) : (
        winnerDelta !== null && <Chip size="small" variant="outlined" label={`±${winnerDelta}`} />
      )}
    </Box>
  );
}

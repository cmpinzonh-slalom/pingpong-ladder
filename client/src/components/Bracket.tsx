import { Box, Button, Chip, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import EditIcon from '@mui/icons-material/EditOutlined';
import type { BracketMatch, BracketPlayer, BracketRound } from '../api/client';
import { formatLabel } from '../lib/format';

const CARD_W = 210;
const SLOT_H = 120; // vertical space per first-round match

interface Props {
  rounds: BracketRound[];
  userId: number;
  isAdmin: boolean;
  /** Cancelled tournaments: show results only, no player or admin actions. */
  readOnly?: boolean;
  onRecord: (m: BracketMatch) => void;
  onReview: (m: BracketMatch) => void;
  onAdmin: (m: BracketMatch) => void;
}

/** Games won by player1 / player2 in the confirmed result, if any. */
function gameScore(m: BracketMatch): [number, number] | null {
  if (!m.result || !m.player1) return null;
  const p1IsA = m.result.player_a.id === m.player1.id;
  let a = 0;
  let b = 0;
  for (const g of m.result.games) {
    const p1 = p1IsA ? g.a : g.b;
    const p2 = p1IsA ? g.b : g.a;
    if (p1 > p2) a++;
    else b++;
  }
  return [a, b];
}

function PlayerLine({
  p,
  score,
  isWinner,
  decided,
  isMe,
  emptyLabel,
}: {
  p: BracketPlayer | null;
  score: number | string | null;
  isWinner: boolean;
  decided: boolean;
  isMe: boolean;
  emptyLabel: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.5,
        bgcolor: isMe ? 'action.selected' : undefined,
        opacity: decided && !isWinner ? 0.55 : 1,
      }}
    >
      {p?.seed && (
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 14 }}>
          {p.seed}
        </Typography>
      )}
      <Typography
        variant="body2"
        noWrap
        sx={{ flex: 1, fontWeight: isWinner ? 700 : 400, fontStyle: p ? 'normal' : 'italic' }}
        color={p ? 'text.primary' : 'text.secondary'}
        title={p?.name}
      >
        {p ? p.name : emptyLabel}
      </Typography>
      {score !== null && (
        <Typography variant="body2" fontWeight={isWinner ? 700 : 400}>
          {score}
        </Typography>
      )}
    </Box>
  );
}

function MatchCard({ m, userId, isAdmin, readOnly = false, onRecord, onReview, onAdmin }: { m: BracketMatch } & Omit<Props, 'rounds'>) {
  const score = gameScore(m);
  const decided = m.winner_id !== null;
  const mine = m.player1?.id === userId || m.player2?.id === userId;
  const walkover = m.status === 'walkover';
  const p1Score = score ? score[0] : walkover ? (m.winner_id === m.player1?.id ? 'W/O' : '') : null;
  const p2Score = score ? score[1] : walkover ? (m.winner_id === m.player2?.id ? 'W/O' : '') : null;

  const showAdmin = !readOnly && isAdmin && (m.status === 'ready' || m.status === 'completed' || m.status === 'walkover');
  let footer: ReactNode = null;
  if (readOnly) {
    footer = null;
  } else if (m.status === 'ready' && m.pending) {
    const awaitingMe = m.pending.awaiting_user_id === userId;
    footer = awaitingMe ? (
      <Button size="small" variant="contained" color="success" fullWidth onClick={() => onReview(m)}>
        Review result
      </Button>
    ) : (
      <Chip size="small" label="Awaiting confirmation" sx={{ width: '100%' }} />
    );
  } else if (m.status === 'ready' && mine) {
    footer = (
      <Button size="small" variant="contained" fullWidth onClick={() => onRecord(m)}>
        Record result
      </Button>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{ width: CARD_W, overflow: 'hidden', borderColor: mine && !decided ? 'primary.main' : undefined }}
      data-testid={`bracket-match-${m.id}`}
    >
      <PlayerLine
        p={m.player1}
        score={p1Score}
        isWinner={decided && m.winner_id === m.player1?.id}
        decided={decided}
        isMe={m.player1?.id === userId}
        emptyLabel={m.status === 'bye' ? 'Bye' : 'TBD'}
      />
      <Box sx={{ borderTop: 1, borderColor: 'divider' }} />
      <PlayerLine
        p={m.player2}
        score={p2Score}
        isWinner={decided && m.winner_id === m.player2?.id}
        decided={decided}
        isMe={m.player2?.id === userId}
        emptyLabel={m.status === 'bye' ? 'Bye' : 'TBD'}
      />
      {(footer || showAdmin) && (
        <Box sx={{ p: 0.75, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>{footer}</Box>
          {showAdmin && (
            <Tooltip title="Admin: set result or walkover">
              <IconButton size="small" aria-label="Admin: set result" onClick={() => onAdmin(m)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Paper>
  );
}

export default function Bracket(props: Props) {
  const { rounds } = props;
  if (rounds.length === 0) return null;
  const firstRoundCount = rounds[0].matches.length;
  const height = Math.max(firstRoundCount * SLOT_H, 140);

  return (
    <Box sx={{ overflowX: 'auto', pb: 1, mx: { xs: -1, sm: 0 } }}>
      <Box sx={{ display: 'flex', gap: 4, minWidth: 'min-content', px: { xs: 1, sm: 0 } }}>
        {rounds.map((r) => (
          <Box key={r.round} sx={{ display: 'flex', flexDirection: 'column', width: CARD_W }}>
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{r.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatLabel(r.best_of)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height, gap: 1 }}>
              {r.matches.map((m) => (
                <MatchCard key={m.id} m={m} {...props} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

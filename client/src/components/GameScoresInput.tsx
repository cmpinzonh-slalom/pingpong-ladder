import { Alert, Box, Button, IconButton, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import type { GameInput } from '../api/client';
import { summarize } from '../lib/scores';

/** Raw text values so inputs can be empty while typing. */
export type GameDraft = { me: string; them: string };

export const emptyGames = (n = 2): GameDraft[] => Array.from({ length: n }, () => ({ me: '', them: '' }));

export function toGames(drafts: GameDraft[]): GameInput[] {
  return drafts.map((d) => ({
    me: d.me === '' ? NaN : Number(d.me),
    them: d.them === '' ? NaN : Number(d.them),
  }));
}

export function fromGames(games: GameInput[]): GameDraft[] {
  return games.map((g) => ({ me: String(g.me), them: String(g.them) }));
}

interface Props {
  value: GameDraft[];
  onChange: (v: GameDraft[]) => void;
  opponentName?: string;
}

export default function GameScoresInput({ value, onChange, opponentName = 'Opponent' }: Props) {
  const set = (i: number, field: keyof GameDraft, v: string) => {
    const next = value.map((g, j) => (j === i ? { ...g, [field]: v.replace(/[^0-9]/g, '') } : g));
    onChange(next);
  };
  const summary = summarize(toGames(value));
  const allFilled = value.every((g) => g.me !== '' && g.them !== '');

  return (
    <Box>
      {value.map((g, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography sx={{ width: 64 }} color="text.secondary">
            Game {i + 1}
          </Typography>
          <TextField
            size="small"
            label="Me"
            value={g.me}
            onChange={(e) => set(i, 'me', e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Game ${i + 1} my score` } }}
            sx={{ width: 90 }}
          />
          <Typography>–</Typography>
          <TextField
            size="small"
            label={opponentName}
            value={g.them}
            onChange={(e) => set(i, 'them', e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Game ${i + 1} opponent score` } }}
            sx={{ width: 90 }}
          />
          <IconButton
            aria-label={`Remove game ${i + 1}`}
            disabled={value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        startIcon={<AddIcon />}
        size="small"
        disabled={value.length >= 5}
        onClick={() => onChange([...value, { me: '', them: '' }])}
      >
        Add game
      </Button>
      {allFilled && (
        <Alert severity={summary.ok ? (summary.iWon ? 'success' : 'info') : 'warning'} sx={{ mt: 2 }}>
          {summary.ok
            ? `${summary.iWon ? 'You won' : 'You lost'} ${summary.myGames}–${summary.theirGames}`
            : summary.error}
        </Alert>
      )}
    </Box>
  );
}

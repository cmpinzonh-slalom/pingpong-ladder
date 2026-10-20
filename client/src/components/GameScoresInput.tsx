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
  /** Label for the first score column (defaults to "Me"). */
  myLabel?: string;
  /** Describe the result as "<name> wins" instead of "You won" (e.g. admins entering results). */
  thirdPerson?: boolean;
  /** Extra validation message (e.g. wrong tournament format), shown when the scores are otherwise valid. */
  extraError?: string | null;
}

// pattern triggers the numeric keypad on iOS; inputMode on Android.
const numeric = { inputMode: 'numeric' as const, pattern: '[0-9]*', maxLength: 2 };

export default function GameScoresInput({
  value,
  onChange,
  opponentName = 'Opponent',
  myLabel = 'Me',
  thirdPerson = false,
  extraError = null,
}: Props) {
  const set = (i: number, field: keyof GameDraft, v: string) => {
    const next = value.map((g, j) => (j === i ? { ...g, [field]: v.replace(/[^0-9]/g, '') } : g));
    onChange(next);
  };
  // Accessible names: "my"/"opponent" for the player's own result; the real names when someone else
  // (an admin judging, or entering a tournament result) records it for two players.
  const firstAria = thirdPerson ? myLabel : 'my';
  const secondAria = thirdPerson ? opponentName : 'opponent';
  const summary = summarize(toGames(value));
  const allFilled = value.every((g) => g.me !== '' && g.them !== '');

  return (
    <Box>
      {value.map((g, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography sx={{ width: { xs: 28, sm: 64 }, flexShrink: 0 }} color="text.secondary">
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Game{' '}
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              G
            </Box>
            {i + 1}
          </Typography>
          <TextField
            size="small"
            label={myLabel}
            value={g.me}
            onChange={(e) => set(i, 'me', e.target.value)}
            slotProps={{ htmlInput: { ...numeric, 'aria-label': `Game ${i + 1} ${firstAria} score` } }}
            sx={{ width: { xs: 'auto', sm: 90 }, flex: { xs: 1, sm: 'none' }, minWidth: 0 }}
          />
          <Typography>–</Typography>
          <TextField
            size="small"
            label={opponentName}
            value={g.them}
            onChange={(e) => set(i, 'them', e.target.value)}
            slotProps={{ htmlInput: { ...numeric, 'aria-label': `Game ${i + 1} ${secondAria} score` } }}
            sx={{ width: { xs: 'auto', sm: 90 }, flex: { xs: 1, sm: 'none' }, minWidth: 0 }}
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
        <Alert severity={extraError || !summary.ok ? 'warning' : summary.iWon ? 'success' : 'info'} sx={{ mt: 2 }}>
          {extraError && summary.ok
            ? extraError
            : summary.ok
              ? thirdPerson
                ? `${summary.iWon ? myLabel : opponentName} wins ${Math.max(summary.myGames, summary.theirGames)}–${Math.min(summary.myGames, summary.theirGames)}`
                : `${summary.iWon ? 'You won' : 'You lost'} ${summary.myGames}–${summary.theirGames}`
              : summary.error}
        </Alert>
      )}
    </Box>
  );
}

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type LeaderboardRow } from '../api/client';
import GameScoresInput, { emptyGames, toGames, type GameDraft } from '../components/GameScoresInput';
import { useAuth } from '../contexts/AuthContext';
import { toPlayedAt } from '../lib/dates';
import { summarize } from '../lib/scores';

const first = (name?: string) => name?.split(' ')[0];

function PlayerPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: LeaderboardRow[];
  value: LeaderboardRow | null;
  onChange: (v: LeaderboardRow | null) => void;
}) {
  return (
    <Autocomplete
      sx={{ minWidth: { xs: '100%', sm: 240 }, flex: 1 }}
      options={options}
      value={value}
      onChange={(_, v) => onChange(v)}
      getOptionLabel={(p) => `${p.name} (${p.rating})`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

export default function RecordMatchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Everyone except me: my opponents in normal mode; in judge mode admins can't judge their own matches.
  const [players, setPlayers] = useState<LeaderboardRow[]>([]);
  const [judge, setJudge] = useState(false);
  const [opponent, setOpponent] = useState<LeaderboardRow | null>(null);
  const [playerA, setPlayerA] = useState<LeaderboardRow | null>(null);
  const [playerB, setPlayerB] = useState<LeaderboardRow | null>(null);
  const [games, setGames] = useState<GameDraft[]>(emptyGames(1));
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const myId = user!.id;
  const isAdmin = !!user!.is_admin;
  useEffect(() => {
    api.users().then((u) => setPlayers(u.filter((p) => p.id !== myId)));
  }, [myId]);

  const summary = summarize(toGames(games));
  const canSubmit = summary.ok && !busy && (judge ? !!playerA && !!playerB : !!opponent);

  const scoreLine = () =>
    toGames(games)
      .map((g) => `${g.me}-${g.them}`)
      .join(', ');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (judge) {
        // GameScoresInput's "me" column is player 1, "them" is player 2.
        await api.judgeMatch(
          playerA!.id,
          playerB!.id,
          toGames(games).map((g) => ({ a: g.me, b: g.them })),
          toPlayedAt(date)
        );
        navigate('/', { state: { flash: `Result recorded: ${playerA!.name} vs ${playerB!.name}` } });
      } else {
        await api.createMatch(opponent!.id, toGames(games), toPlayedAt(date));
        navigate('/', { state: { flash: `Match sent to ${opponent!.name} for confirmation` } });
      }
    } catch (err) {
      setError((err as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleJudge = (on: boolean) => {
    setJudge(on);
    setError(null);
  };

  const winnerName = summary.ok ? (summary.iWon ? playerA?.name : playerB?.name) : undefined;

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5">{judge ? 'Judge a match' : 'Record a match'}</Typography>
          {isAdmin && (
            <FormControlLabel
              control={<Switch checked={judge} onChange={(e) => toggleJudge(e.target.checked)} />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <GavelIcon fontSize="small" /> Judge mode
                </Box>
              }
            />
          )}
        </Box>
        <Typography color="text.secondary" sx={{ mb: 3, mt: 1 }}>
          {judge
            ? 'Record a result for two other players. It counts immediately, with no confirmation, and is marked as judged by you.'
            : 'Ratings only change once your opponent confirms the result.'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          {judge ? (
            <>
              <PlayerPicker
                label="Player 1"
                options={players.filter((p) => p.id !== playerB?.id)}
                value={playerA}
                onChange={setPlayerA}
              />
              <PlayerPicker
                label="Player 2"
                options={players.filter((p) => p.id !== playerA?.id)}
                value={playerB}
                onChange={setPlayerB}
              />
            </>
          ) : (
            <PlayerPicker label="Opponent" options={players} value={opponent} onChange={setOpponent} />
          )}
          <TextField
            sx={{ width: { xs: '100%', sm: 'auto' } }}
            type="date"
            label="Played on"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dayjs().format('YYYY-MM-DD') } }}
          />
        </Box>

        {judge ? (
          <GameScoresInput
            value={games}
            onChange={setGames}
            myLabel={first(playerA?.name) ?? 'Player 1'}
            opponentName={first(playerB?.name) ?? 'Player 2'}
            thirdPerson
          />
        ) : (
          <GameScoresInput value={games} onChange={setGames} opponentName={first(opponent?.name)} />
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Button
          variant="contained"
          size="large"
          sx={{ mt: 3, width: { xs: '100%', sm: 'auto' } }}
          disabled={!canSubmit}
          startIcon={judge ? <GavelIcon /> : undefined}
          onClick={judge ? () => setConfirming(true) : submit}
        >
          {judge ? 'Record result (no confirmation needed)' : 'Submit for confirmation'}
        </Button>
      </CardContent>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Record this result?</DialogTitle>
        <DialogContent>
          <Typography>
            <b>{playerA?.name}</b> vs <b>{playerB?.name}</b>: {scoreLine()}
          </Typography>
          {winnerName && <Typography sx={{ mt: 1 }}>{winnerName} wins. Ratings update immediately.</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy}>
            Record result
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

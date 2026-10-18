import { Alert, Autocomplete, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type LeaderboardRow } from '../api/client';
import GameScoresInput, { emptyGames, toGames, type GameDraft } from '../components/GameScoresInput';
import { useAuth } from '../contexts/AuthContext';
import { summarize } from '../lib/scores';

export default function RecordMatchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<LeaderboardRow[]>([]);
  const [opponent, setOpponent] = useState<LeaderboardRow | null>(null);
  const [games, setGames] = useState<GameDraft[]>(emptyGames(1));
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myId = user!.id;
  useEffect(() => {
    api.users().then((u) => setPlayers(u.filter((p) => p.id !== myId)));
  }, [myId]);

  const summary = summarize(toGames(games));
  const canSubmit = !!opponent && summary.ok && !busy;

  const submit = async () => {
    if (!opponent) return;
    setBusy(true);
    setError(null);
    try {
      // Midday local time avoids the date shifting across time zones.
      const playedAt = dayjs(date).hour(12).toISOString();
      await api.createMatch(opponent.id, toGames(games), playedAt);
      navigate('/', { state: { flash: `Match sent to ${opponent.name} for confirmation` } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" gutterBottom>
          Record a match
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Ratings only change once your opponent confirms the result.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          <Autocomplete
            sx={{ minWidth: { xs: '100%', sm: 280 }, flex: 1 }}
            options={players}
            value={opponent}
            onChange={(_, v) => setOpponent(v)}
            getOptionLabel={(p) => `${p.name} (${p.rating})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Opponent" />}
          />
          <TextField
            sx={{ width: { xs: '100%', sm: 'auto' } }}
            type="date"
            label="Played on"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dayjs().format('YYYY-MM-DD') } }}
          />
        </Box>

        <GameScoresInput value={games} onChange={setGames} opponentName={opponent?.name.split(' ')[0]} />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Button variant="contained" size="large" sx={{ mt: 3, width: { xs: '100%', sm: 'auto' } }} disabled={!canSubmit} onClick={submit}>
          Submit for confirmation
        </Button>
      </CardContent>
    </Card>
  );
}

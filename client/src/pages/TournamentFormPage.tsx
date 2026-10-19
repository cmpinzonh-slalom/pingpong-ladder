import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type TournamentInput } from '../api/client';

const FORMATS = [
  { value: 1, label: 'Single game' },
  { value: 3, label: 'Best of 3' },
  { value: 5, label: 'Best of 5' },
];

interface FormState {
  name: string;
  starts_on: string;
  deadline: string; // datetime-local value
  best_of: number;
  quarters_best_of: number | '';
  semis_best_of: number | '';
  final_best_of: number | '';
  max_players: string;
}

const LOCAL_DT = 'YYYY-MM-DDTHH:mm';

function FormatSelect({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  optional?: boolean;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      sx={{ minWidth: 170, flex: 1 }}
      slotProps={{ select: { displayEmpty: optional }, inputLabel: { shrink: true } }}
    >
      {optional && (
        <MenuItem value="">
          <em>Same as default</em>
        </MenuItem>
      )}
      {FORMATS.map((f) => (
        <MenuItem key={f.value} value={f.value}>
          {f.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Create (/tournaments/new) or edit (/tournaments/:id/edit) a tournament. Admins only. */
export default function TournamentFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    name: '',
    starts_on: dayjs().add(14, 'day').format('YYYY-MM-DD'),
    deadline: dayjs().add(7, 'day').hour(18).minute(0).format(LOCAL_DT),
    best_of: 3,
    quarters_best_of: '',
    semis_best_of: '',
    final_best_of: 5,
    max_players: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .tournament(Number(id))
      .then((t) =>
        setForm({
          name: t.name,
          starts_on: t.starts_on,
          deadline: dayjs(t.signup_deadline).format(LOCAL_DT),
          best_of: t.best_of,
          quarters_best_of: t.quarters_best_of ?? '',
          semis_best_of: t.semis_best_of ?? '',
          final_best_of: t.final_best_of ?? '',
          max_players: t.max_players ? String(t.max_players) : '',
        })
      )
      .catch((err) => setError(err.message));
  }, [editing, id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (dayjs(form.deadline).isAfter(dayjs(form.starts_on).endOf('day'))) {
      setError('The sign-up deadline should be on or before the tournament date');
      return;
    }
    const body: TournamentInput = {
      name: form.name.trim(),
      starts_on: form.starts_on,
      signup_deadline: dayjs(form.deadline).toISOString(),
      best_of: form.best_of,
      quarters_best_of: form.quarters_best_of === '' ? null : form.quarters_best_of,
      semis_best_of: form.semis_best_of === '' ? null : form.semis_best_of,
      final_best_of: form.final_best_of === '' ? null : form.final_best_of,
      max_players: form.max_players ? Number(form.max_players) : null,
    };
    setBusy(true);
    try {
      const t = editing ? await api.updateTournament(Number(id), body) : await api.createTournament(body);
      navigate(`/tournaments/${t.id}`);
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
          {editing ? 'Edit tournament' : 'New tournament'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} fullWidth />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              type="date"
              label="Tournament date"
              value={form.starts_on}
              onChange={(e) => set('starts_on', e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="datetime-local"
              label="Sign-up deadline"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <TextField
            label="Max players (optional)"
            value={form.max_players}
            onChange={(e) => set('max_players', e.target.value.replace(/[^0-9]/g, ''))}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
            sx={{ maxWidth: 240 }}
          />

          <Typography variant="subtitle1" sx={{ mt: 1 }}>
            Match format
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormatSelect label="Default" value={form.best_of} onChange={(v) => set('best_of', v === '' ? 3 : v)} />
            <FormatSelect label="Quarterfinals" value={form.quarters_best_of} onChange={(v) => set('quarters_best_of', v)} optional />
            <FormatSelect label="Semifinals" value={form.semis_best_of} onChange={(v) => set('semis_best_of', v)} optional />
            <FormatSelect label="Final" value={form.final_best_of} onChange={(v) => set('final_best_of', v)} optional />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Earlier rounds use the default. Seeding and the bracket are generated after the sign-up deadline.
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" onClick={submit} disabled={busy || form.name.trim().length < 3}>
              {editing ? 'Save changes' : 'Create tournament'}
            </Button>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

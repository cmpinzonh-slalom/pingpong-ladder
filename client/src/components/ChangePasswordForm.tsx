import { Alert, Box, Button, TextField } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { api, type Me } from '../api/client';

const MIN_PASSWORD = 8;

interface Props {
  /** After an admin reset, the current password isn't required. */
  requireCurrent: boolean;
  onDone: (me: Me) => void;
}

export default function ChangePasswordForm({ requireCurrent, onDone }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`);
    if (next !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const me = await api.changePassword(next, requireCurrent ? current : undefined);
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit}>
      {requireCurrent && (
        <TextField
          label="Current password"
          type="password"
          fullWidth
          margin="dense"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      )}
      <TextField
        label="New password"
        type="password"
        fullWidth
        margin="dense"
        autoComplete="new-password"
        helperText={`At least ${MIN_PASSWORD} characters`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <TextField
        label="Confirm new password"
        type="password"
        fullWidth
        margin="dense"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        sx={{ mt: 2 }}
        disabled={busy || !next || !confirm || (requireCurrent && !current)}
      >
        {busy ? 'Saving…' : 'Change password'}
      </Button>
    </Box>
  );
}

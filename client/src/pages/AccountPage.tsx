import { Alert, Box, Button, Card, CardContent, Divider, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { useAuth } from '../contexts/AuthContext';

function DisplayNameForm() {
  const { user, setUser } = useAuth();
  const current = user!.display_name ?? '';
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const unchanged = trimmed === current;
  const valid = trimmed.length >= 2 && trimmed.length <= 40;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const me = await api.updateMe(trimmed);
      setUser(me);
      // The field is disabled while saving, so nothing typed during the request can be lost here.
      setName(me.display_name ?? trimmed);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit}>
      <Typography variant="h6">Display name</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Shown on the leaderboard, in matches and in tournaments. Changing it updates your past results too.
      </Typography>
      <TextField
        label="Display name"
        fullWidth
        margin="dense"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        disabled={busy}
        error={name.length > 0 && !valid}
        helperText={name.length > 0 && !valid ? 'Use 2-40 characters' : undefined}
        slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      {saved && (
        <Alert severity="success" sx={{ mt: 1 }} onClose={() => setSaved(false)}>
          Display name updated.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={busy || !valid || unchanged}>
        {busy ? 'Saving…' : 'Save name'}
      </Button>
    </Box>
  );
}

export default function AccountPage() {
  const { user, setUser } = useAuth();
  const [done, setDone] = useState(false);

  return (
    <Card sx={{ maxWidth: 480 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Account
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Signed in as {user!.email}
        </Typography>

        <DisplayNameForm />

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6">Change password</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Other devices will be signed out.
        </Typography>
        {done && (
          <Alert severity="success" sx={{ my: 1 }} onClose={() => setDone(false)}>
            Password changed.
          </Alert>
        )}
        <ChangePasswordForm
          requireCurrent
          onDone={(me) => {
            setUser(me);
            setDone(true);
          }}
        />
      </CardContent>
    </Card>
  );
}

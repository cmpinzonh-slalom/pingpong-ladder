import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import SportsTennisIcon from '@mui/icons-material/SportsTennis';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith('@slalom.com')) {
      setError('Use your @slalom.com email address');
      return;
    }
    setBusy(true);
    try {
      await api.requestLink(normalized);
      setSentTo(normalized);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: { xs: 6, sm: 12 }, px: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SportsTennisIcon color="primary" />
            <Typography variant="h5">Ping Pong Ladder</Typography>
          </Box>
          {sentTo ? (
            <>
              <Typography variant="h6" gutterBottom>
                Check your email
              </Typography>
              <Typography color="text.secondary">
                We sent a sign-in link to <b>{sentTo}</b>. It expires in 15 minutes. Check your junk / quarantine
                folder if you don't see it.
              </Typography>
              <Button sx={{ mt: 2 }} onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </>
          ) : (
            <form onSubmit={submit}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Sign in with your Slalom email. We'll send you a magic link — no password needed.
              </Typography>
              <TextField
                label="Email"
                type="email"
                placeholder="first.last@slalom.com"
                fullWidth
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
              <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={busy || !email}>
                {busy ? 'Sending…' : 'Send sign-in link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

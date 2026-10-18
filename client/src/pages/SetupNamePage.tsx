import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function SetupNamePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(() => {
    const local = user?.email.split('@')[0] ?? '';
    return local
      .split('.')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setUser(await api.updateMe(name.trim()));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: { xs: 4, sm: 12 }, px: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h5" gutterBottom>
            Welcome!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Pick the name other players will see on the leaderboard.
          </Typography>
          <form onSubmit={submit}>
            <TextField label="Display name" fullWidth autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={name.trim().length < 2}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

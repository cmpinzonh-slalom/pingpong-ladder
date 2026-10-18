import { Alert, Box, Button, Card, CardContent, Tab, Tabs, TextField, Typography } from '@mui/material';
import SportsTennisIcon from '@mui/icons-material/SportsTennis';
import PasswordField from '../components/PasswordField';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const MIN_PASSWORD = 8;

/** Suggest "First Last" from first.last@slalom.com. */
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export default function LoginPage() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = email.trim().toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      if (!normalized.endsWith('@slalom.com')) return setError('Use your @slalom.com email address');
      if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`);
      if (password !== confirm) return setError('Passwords do not match');
    }
    setBusy(true);
    try {
      const me =
        mode === 'login'
          ? await api.login(normalized, password)
          : await api.register(normalized, password, name.trim());
      setUser(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
    setConfirm('');
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: { xs: 6, sm: 12 }, px: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <SportsTennisIcon color="primary" />
            <Typography variant="h5">Ping Pong Ladder</Typography>
          </Box>
          <Tabs value={mode} onChange={(_, v) => switchMode(v)} sx={{ mb: 2 }}>
            <Tab value="login" label="Sign in" />
            <Tab value="register" label="Create account" />
          </Tabs>
          <form onSubmit={submit}>
            <TextField
              label="Slalom email"
              type="email"
              placeholder="first.last@slalom.com"
              fullWidth
              autoFocus
              autoComplete="username"
              slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
              margin="dense"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (!nameTouched) setName(nameFromEmail(e.target.value));
              }}
            />
            {mode === 'register' && (
              <TextField
                label="Display name"
                helperText="Shown on the leaderboard"
                fullWidth
                margin="dense"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
              />
            )}
            <PasswordField
              label="Password"
              
              fullWidth
              margin="dense"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              helperText={mode === 'register' ? `At least ${MIN_PASSWORD} characters` : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && (
              <PasswordField
                label="Confirm password"
                
                fullWidth
                margin="dense"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              disabled={busy || !email || !password || (mode === 'register' && name.trim().length < 2)}
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            {mode === 'login' && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Forgot your password? Ask an admin to reset it.
              </Typography>
            )}
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

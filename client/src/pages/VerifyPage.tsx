import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation consuming the single-use token twice.
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) {
      setError('Missing sign-in token');
      return;
    }
    api
      .verify(token)
      .then(async () => {
        await refresh();
        navigate('/', { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [params, navigate, refresh]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 12, gap: 2, px: 2 }}>
      {error ? (
        <>
          <Alert severity="error">{error}</Alert>
          <Button variant="contained" onClick={() => navigate('/', { replace: true })}>
            Request a new link
          </Button>
        </>
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
}

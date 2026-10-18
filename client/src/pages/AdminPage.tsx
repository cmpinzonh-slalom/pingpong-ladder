import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useCallback, useEffect, useState } from 'react';
import { api, type AdminUser } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminUser | null>(null);
  const [result, setResult] = useState<{ email: string; temporary_password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api
      .adminUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const reset = async (u: AdminUser) => {
    setConfirming(null);
    setError(null);
    try {
      setResult(await api.adminResetPassword(u.id));
      setCopied(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = users.filter(
    (u) => !q || u.email.includes(q) || (u.display_name ?? '').toLowerCase().includes(q)
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Admin · Users
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Resetting a password signs the user out everywhere and gives you a temporary password to share with them.
          They'll be asked to choose a new one when they sign in.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField size="small" label="Search" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mb: 2 }} />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.display_name ?? '–'}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {!u.has_password ? (
                      <Chip size="small" label="No password" />
                    ) : u.must_change_password ? (
                      <Chip size="small" color="warning" label="Reset pending" />
                    ) : (
                      <Chip size="small" color="success" variant="outlined" label="Active" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {u.id !== user!.id && (
                      <Button size="small" onClick={() => setConfirming(u)}>
                        Reset password
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      <Dialog open={!!confirming} onClose={() => setConfirming(null)}>
        <DialogTitle>Reset password?</DialogTitle>
        <DialogContent>
          <Typography>
            {confirming?.display_name ?? confirming?.email} will be signed out and need the temporary password to sign
            back in.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={() => confirming && reset(confirming)}>
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!result} onClose={() => setResult(null)}>
        <DialogTitle>Temporary password</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Share this with <b>{result?.email}</b> privately (e.g. Teams chat). It won't be shown again.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 20, flex: 1 }}>{result?.temporary_password}</Typography>
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <IconButton
                aria-label="Copy temporary password"
                onClick={() => {
                  navigator.clipboard?.writeText(result!.temporary_password);
                  setCopied(true);
                }}
              >
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setResult(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

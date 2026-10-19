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
  const [roleChange, setRoleChange] = useState<{ user: AdminUser; admin: boolean } | null>(null);

  const isOwner = user!.is_owner;
  /** Mirrors the server rules: nobody resets an owner; only owners reset other admins. */
  const canReset = (u: AdminUser) => u.id !== user!.id && !u.is_owner && (isOwner || !u.is_admin);

  const changeRole = async (u: AdminUser, admin: boolean) => {
    setRoleChange(null);
    setError(null);
    try {
      await api.setAdmin(u.id, admin);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
          {isOwner && ' As an owner, you can also make users admins or revoke that role.'}
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
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {u.display_name ?? '–'}
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, wordBreak: 'break-all' }}>
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{u.email}</TableCell>
                  <TableCell>
                    {u.is_owner ? (
                      <Chip size="small" color="primary" label="Owner" />
                    ) : u.is_admin ? (
                      <Chip size="small" color="secondary" label="Admin" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Player
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {!u.has_password ? (
                      <Chip size="small" label="No password" />
                    ) : u.must_change_password ? (
                      <Chip size="small" color="warning" label="Reset pending" />
                    ) : (
                      <Chip size="small" color="success" variant="outlined" label="Active" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {isOwner && !u.is_owner && (
                        <Button
                          size="small"
                          color={u.is_admin ? 'warning' : 'primary'}
                          onClick={() => setRoleChange({ user: u, admin: !u.is_admin })}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {u.is_admin ? 'Revoke admin' : 'Make admin'}
                        </Button>
                      )}
                      {canReset(u) && (
                        <Button size="small" onClick={() => setConfirming(u)} sx={{ whiteSpace: 'nowrap' }}>
                          Reset password
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      <Dialog open={!!roleChange} onClose={() => setRoleChange(null)}>
        <DialogTitle>{roleChange?.admin ? 'Make admin?' : 'Revoke admin?'}</DialogTitle>
        <DialogContent>
          <Typography>
            {roleChange?.admin
              ? `${roleChange.user.display_name ?? roleChange.user.email} will be able to create and run tournaments, set results and reset players' passwords.`
              : `${roleChange?.user.display_name ?? roleChange?.user.email} will lose admin access immediately.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleChange(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={roleChange?.admin ? 'primary' : 'warning'}
            onClick={() => roleChange && changeRole(roleChange.user, roleChange.admin)}
          >
            {roleChange?.admin ? 'Make admin' : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

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

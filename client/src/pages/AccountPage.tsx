import { Alert, Card, CardContent, Typography } from '@mui/material';
import { useState } from 'react';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { useAuth } from '../contexts/AuthContext';

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

import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import ChangePasswordForm from '../components/ChangePasswordForm';
import { useAuth } from '../contexts/AuthContext';

/** Shown after an admin reset, before anything else is accessible. */
export default function ForcePasswordChangePage() {
  const { setUser, logout } = useAuth();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 12, px: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            Choose a new password
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            Your password was reset by an admin. Pick a new one to continue.
          </Typography>
          <ChangePasswordForm requireCurrent={false} onDone={setUser} />
          <Button sx={{ mt: 1 }} color="inherit" onClick={logout}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

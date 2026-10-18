import { Box, CircularProgress } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage';
import HeadToHeadPage from './pages/HeadToHeadPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import RecordMatchPage from './pages/RecordMatchPage';
import SetupNamePage from './pages/SetupNamePage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 12 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <LoginPage />;
  if (user.must_change_password) return <ForcePasswordChangePage />;
  if (!user.display_name) return <SetupNamePage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/record" element={<RecordMatchPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/players/:id" element={<ProfilePage />} />
        <Route path="/h2h/:a/:b" element={<HeadToHeadPage />} />
        <Route path="/account" element={<AccountPage />} />
        {user.is_admin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

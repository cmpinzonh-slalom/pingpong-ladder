import { Box, Button, Card, CardContent, Divider, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, opponentOf, type Match, type Profile, type RatingHistory } from '../api/client';
import MatchRow from '../components/MatchRow';
import { useAuth } from '../contexts/AuthContext';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ minWidth: 90 }}>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const playerId = Number(id);
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<Match[]>([]);
  const [ratingHistory, setRatingHistory] = useState<RatingHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // bumped after an admin voids a judged match

  useEffect(() => {
    setError(null);
    Promise.all([api.user(playerId), api.history(playerId), api.ratingHistory(playerId)])
      .then(([p, h, rh]) => {
        setProfile(p);
        setHistory(h);
        setRatingHistory(rh);
      })
      .catch((err) => setError(err.message));
  }, [playerId, reloadKey]);

  // Built from every rating change (matches and adjustments such as overridden tournament results),
  // so the chart always ends at the player's current rating.
  const chart = useMemo(() => {
    if (!ratingHistory || ratingHistory.points.length === 0) return [];
    return [
      { label: 'Start', rating: ratingHistory.start, detail: 'Starting rating' },
      ...ratingHistory.points.map((pt, i) => ({
        label: `${i + 1}. ${dayjs(pt.at).format('MMM D')}`,
        rating: pt.rating,
        detail: pt.label,
      })),
    ];
  }, [ratingHistory]);

  const opponents = useMemo(() => {
    const map = new Map<number, string>();
    history.forEach((m) => {
      const o = opponentOf(m, playerId);
      map.set(o.id, o.name);
    });
    return [...map.entries()];
  }, [history, playerId]);

  if (error) return <Typography color="error">{error}</Typography>;
  if (!profile) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h5">{profile.name}</Typography>
            {user!.id !== playerId && (
              <Button component={RouterLink} to={`/h2h/${user!.id}/${playerId}`} variant="outlined" size="small">
                Head-to-head vs me
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 4, mt: 2, flexWrap: 'wrap' }}>
            <Stat label="Rating" value={profile.rating} />
            <Stat label="Rank" value={profile.played ? `#${profile.rank}` : '–'} />
            <Stat label="Wins" value={profile.wins} />
            <Stat label="Losses" value={profile.losses} />
            <Stat label="Win %" value={profile.played ? `${Math.round((profile.wins / profile.played) * 100)}%` : '–'} />
          </Box>
        </CardContent>
      </Card>

      {chart.length > 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Rating history
            </Typography>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={['dataMin - 20', 'dataMax + 20']} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, _name, item) => [value, (item?.payload as { detail?: string })?.detail ?? 'Rating']}
                  />
                  <Line type="monotone" dataKey="rating" stroke="#0c62fb" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      )}

      {opponents.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Head-to-head
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {opponents.map(([oid, name]) => (
                <Button key={oid} size="small" variant="outlined" component={RouterLink} to={`/h2h/${playerId}/${oid}`}>
                  vs {name}
                </Button>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Match history
          </Typography>
          {history.length === 0 && <Typography color="text.secondary">No confirmed matches yet.</Typography>}
          {history.map((m, i) => (
            <Box key={m.id}>
              {i > 0 && <Divider />}
              <MatchRow match={m} viewerId={playerId} onVoided={() => setReloadKey((k) => k + 1)} />
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

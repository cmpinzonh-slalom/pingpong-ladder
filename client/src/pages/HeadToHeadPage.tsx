import { Box, Card, CardContent, Divider, Link, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api, type HeadToHead } from '../api/client';
import MatchRow from '../components/MatchRow';

function Side({ label, a, b }: { label: string; a: number; b: number }) {
  const total = a + b || 1;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography fontWeight={700}>{a}</Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography fontWeight={700}>{b}</Typography>
      </Box>
      <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: 'grey.200' }}>
        <Box sx={{ width: `${(a / total) * 100}%`, bgcolor: 'primary.main' }} />
        <Box sx={{ width: `${(b / total) * 100}%`, bgcolor: 'secondary.main' }} />
      </Box>
    </Box>
  );
}

export default function HeadToHeadPage() {
  const { a, b } = useParams();
  const [data, setData] = useState<HeadToHead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // bumped after an admin voids a judged match

  useEffect(() => {
    setError(null);
    api
      .h2h(Number(a), Number(b))
      .then(setData)
      .catch((err) => setError(err.message));
  }, [a, b, reloadKey]);

  if (error) return <Typography color="error">{error}</Typography>;
  if (!data) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Link component={RouterLink} to={`/players/${data.a.id}`} variant="h6" underline="hover" color="primary">
                {data.a.name}
              </Link>
              <Typography variant="body2" color="text.secondary">
                {data.a.rating}
              </Typography>
            </Box>
            <Typography variant="h6" color="text.secondary">
              vs
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Link component={RouterLink} to={`/players/${data.b.id}`} variant="h6" underline="hover" color="secondary">
                {data.b.name}
              </Link>
              <Typography variant="body2" color="text.secondary">
                {data.b.rating}
              </Typography>
            </Box>
          </Box>
          {data.matches_played === 0 ? (
            <Typography color="text.secondary">These players haven't played a confirmed match yet.</Typography>
          ) : (
            <>
              <Side label="Matches won" a={data.a_wins} b={data.b_wins} />
              <Side label="Games won" a={data.a_games} b={data.b_games} />
              <Side label="Points scored" a={data.a_points} b={data.b_points} />
            </>
          )}
        </CardContent>
      </Card>

      {data.matches.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Matches ({data.matches_played})
            </Typography>
            {data.matches.map((m, i) => (
              <Box key={m.id}>
                {i > 0 && <Divider />}
                <MatchRow match={m} viewerId={data.a.id} onVoided={() => setReloadKey((k) => k + 1)} />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

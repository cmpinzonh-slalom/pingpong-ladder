import {
  Card,
  CardContent,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, type LeaderboardRow } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    api.users().then(setRows);
  }, []);

  // Players who haven't played yet are listed after ranked players.
  const ranked = (rows ?? []).filter((r) => r.played > 0);
  const unranked = (rows ?? []).filter((r) => r.played === 0);

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Leaderboard
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Player</TableCell>
                <TableCell align="right">Rating</TableCell>
                <TableCell align="right">W–L</TableCell>
                <TableCell align="right">Win %</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {[...ranked, ...unranked].map((r, i) => (
                <TableRow key={r.id} selected={r.id === user!.id}>
                  <TableCell>{r.played > 0 ? i + 1 : '–'}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/players/${r.id}`} underline="hover">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell align="right">
                    <b>{r.rating}</b>
                  </TableCell>
                  <TableCell align="right">
                    {r.wins}–{r.losses}
                  </TableCell>
                  <TableCell align="right">{r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '–'}</TableCell>
                  <TableCell align="right">
                    {r.id !== user!.id && (
                      <Link component={RouterLink} to={`/h2h/${user!.id}/${r.id}`} variant="body2">
                        vs me
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

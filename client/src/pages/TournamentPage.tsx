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
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PersonRemoveIcon from '@mui/icons-material/PersonRemoveOutlined';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api, type BracketMatch, type TournamentDetail } from '../api/client';
import Bracket from '../components/Bracket';
import GameScoresInput, { emptyGames, toGames, type GameDraft } from '../components/GameScoresInput';
import PendingMatchCard from '../components/PendingMatchCard';
import { useAuth } from '../contexts/AuthContext';
import { fromNow, toPlayedAt } from '../lib/dates';
import { formatError, formatLabel } from '../lib/format';
import { StatusChip } from './TournamentsPage';

const REFRESH_MS = 30_000;

function roundOf(t: TournamentDetail, m: BracketMatch) {
  return t.rounds.find((r) => r.round === m.round)!;
}

export default function TournamentPage() {
  const { id } = useParams();
  const tid = Number(id);
  const { user, refresh: refreshMe } = useAuth();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [t, setT] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialog state
  const [recording, setRecording] = useState<BracketMatch | null>(null);
  const [reviewing, setReviewing] = useState<BracketMatch | null>(null);
  const [adminFor, setAdminFor] = useState<BracketMatch | null>(null);
  const [adminTab, setAdminTab] = useState<'result' | 'walkover'>('result');
  const [walkoverWinner, setWalkoverWinner] = useState<number | null>(null);
  const [games, setGames] = useState<GameDraft[]>(emptyGames(1));
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setT(await api.tournament(tid));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tid]);

  // Keep the bracket fresh while the page is open: poll, and refresh when returning to the tab.
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const act = async (fn: () => Promise<TournamentDetail | unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'rounds' in res) setT(res as TournamentDetail);
      else await load();
      setFlash(msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !t) return <Alert severity="error">{error}</Alert>;
  if (!t) return null;

  const me = user!.id;
  const isAdmin = user!.is_admin;
  const deadlinePassed = dayjs(t.signup_deadline).isBefore(dayjs());
  const full = !!t.max_players && t.entrant_count >= t.max_players;
  const overrides = [
    t.quarters_best_of && `QF: ${formatLabel(t.quarters_best_of)}`,
    t.semis_best_of && `SF: ${formatLabel(t.semis_best_of)}`,
    t.final_best_of && `Final: ${formatLabel(t.final_best_of)}`,
  ].filter(Boolean);

  const openRecord = (m: BracketMatch) => {
    setGames(emptyGames(1));
    setDialogError(null);
    setRecording(m);
  };
  const openAdmin = (m: BracketMatch) => {
    setGames(emptyGames(1));
    setDialogError(null);
    setAdminTab('result');
    setWalkoverWinner(null);
    setAdminFor(m);
  };

  const submitRecord = async () => {
    if (!recording) return;
    setDialogError(null);
    try {
      await api.submitTournamentResult(t.id, recording.id, toGames(games), toPlayedAt(dayjs().format('YYYY-MM-DD')));
      setRecording(null);
      setFlash('Result sent to your opponent for confirmation');
      load();
    } catch (err) {
      setDialogError((err as Error).message);
    }
  };

  const submitAdmin = async () => {
    if (!adminFor) return;
    setDialogError(null);
    try {
      const body =
        adminTab === 'walkover'
          ? { walkover: walkoverWinner! }
          : { games: toGames(games).map((g) => ({ p1: g.me, p2: g.them })) };
      setT(await api.adminTournamentResult(t.id, adminFor.id, body));
      setAdminFor(null);
      setFlash(adminTab === 'walkover' ? 'Walkover recorded' : 'Result recorded');
      refreshMe();
    } catch (err) {
      setDialogError((err as Error).message);
    }
  };

  const recordOpp = recording && (recording.player1?.id === me ? recording.player2 : recording.player1);
  const recordFormat = recording ? roundOf(t, recording).best_of : 3;
  const adminFormat = adminFor ? roundOf(t, adminFor).best_of : 3;
  const first = (name?: string) => name?.split(' ')[0] ?? '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="h5">{t.name}</Typography>
            <StatusChip t={t} />
          </Box>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {dayjs(t.starts_on).format('dddd, MMMM D, YYYY')} · {formatLabel(t.best_of)}
            {overrides.length > 0 && ` (${overrides.join(', ')})`}
          </Typography>
          {t.status === 'signup' && (
            <Typography sx={{ mt: 1 }}>
              {deadlinePassed ? 'Sign-up closed' : 'Sign up by'} {dayjs(t.signup_deadline).format('ddd, MMM D [at] h:mm A')}
              {!deadlinePassed && ` (${fromNow(t.signup_deadline)})`}
            </Typography>
          )}
          {t.status === 'completed' && t.winner && (
            <Alert icon={<EmojiEventsIcon />} severity="success" sx={{ mt: 2 }}>
              Champion: <b>{t.winner.name}</b>
            </Alert>
          )}
          {t.status === 'cancelled' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This tournament was cancelled.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {t.signup_open && !t.entered && (
              <Button variant="contained" disabled={busy || full} onClick={() => act(() => api.tournamentSignup(t.id), "You're signed up!")}>
                {full ? 'Tournament full' : 'Sign up'}
              </Button>
            )}
            {t.signup_open && t.entered && (
              <Button color="inherit" variant="outlined" disabled={busy} onClick={() => act(() => api.tournamentWithdraw(t.id), 'You withdrew')}>
                Withdraw
              </Button>
            )}
            {isAdmin && t.status === 'signup' && (
              <>
                <Tooltip title={deadlinePassed ? '' : 'Available once the sign-up deadline has passed'}>
                  <span>
                    <Button
                      variant="contained"
                      color="secondary"
                      disabled={busy || !deadlinePassed || t.entrant_count < 2}
                      onClick={() => {
                        if (window.confirm(`Draw the bracket for ${t.entrant_count} players? Sign-ups will be locked.`)) {
                          act(() => api.generateBracket(t.id), 'Bracket generated');
                        }
                      }}
                    >
                      Generate bracket
                    </Button>
                  </span>
                </Tooltip>
                <Button component={RouterLink} to={`/tournaments/${t.id}/edit`} disabled={busy}>
                  Edit
                </Button>
              </>
            )}
            {isAdmin && (t.status === 'signup' || t.status === 'in_progress') && (
              <Button
                color="error"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Cancel this tournament? Pending results will be withdrawn.')) {
                    act(() => api.cancelTournament(t.id), 'Tournament cancelled');
                  }
                }}
              >
                Cancel tournament
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {t.rounds.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Bracket
            </Typography>
            <Bracket
              rounds={t.rounds}
              userId={me}
              isAdmin={isAdmin}
              readOnly={t.status === 'cancelled'}
              onRecord={openRecord}
              onReview={setReviewing}
              onAdmin={openAdmin}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Players ({t.entrant_count}
            {t.max_players ? `/${t.max_players}` : ''})
          </Typography>
          {t.entrants.length === 0 && <Typography color="text.secondary">No one has signed up yet.</Typography>}
          <List dense disablePadding>
            {[...t.entrants]
              .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || b.rating - a.rating)
              .map((e) => (
                <ListItem
                  key={e.id}
                  disableGutters
                  secondaryAction={
                    isAdmin &&
                    t.status === 'signup' && (
                      <IconButton
                        edge="end"
                        aria-label={`Remove ${e.name}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${e.name} from the tournament?`)) {
                            act(() => api.removeEntrant(t.id, e.id), `${e.name} removed`);
                          }
                        }}
                      >
                        <PersonRemoveIcon fontSize="small" />
                      </IconButton>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <RouterLink to={`/players/${e.id}`} style={{ textDecoration: 'none' }}>
                          {e.name}
                        </RouterLink>
                        {e.seed && <Chip size="small" label={`Seed ${e.seed}`} />}
                        {e.id === me && <Chip size="small" variant="outlined" label="You" />}
                      </Box>
                    }
                    secondary={`Rating ${e.rating}`}
                  />
                </ListItem>
              ))}
          </List>
        </CardContent>
      </Card>

      {/* Player records a result */}
      <Dialog open={!!recording} onClose={() => setRecording(null)} fullWidth maxWidth="xs" fullScreen={fullScreen}>
        <DialogTitle>
          {recording && roundOf(t, recording).name} vs {recordOpp?.name}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {formatLabel(recordFormat)}. {recordOpp?.name} will be asked to confirm.
          </Typography>
          <GameScoresInput
            value={games}
            onChange={setGames}
            opponentName={first(recordOpp?.name)}
            extraError={formatError(toGames(games), recordFormat)}
          />
          {dialogError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {dialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecording(null)}>Cancel</Button>
          <Button variant="contained" disabled={!!formatError(toGames(games), recordFormat)} onClick={submitRecord}>
            Submit for confirmation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Opponent reviews a pending result */}
      <Dialog open={!!reviewing} onClose={() => setReviewing(null)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>Review result</DialogTitle>
        <DialogContent>
          {reviewing?.pending && (
            <PendingMatchCard
              match={reviewing.pending}
              userId={me}
              onChanged={(msg) => {
                setReviewing(null);
                setFlash(msg);
                load();
                refreshMe();
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewing(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Admin sets result / walkover */}
      <Dialog open={!!adminFor} onClose={() => setAdminFor(null)} fullWidth maxWidth="xs" fullScreen={fullScreen}>
        <DialogTitle>
          {adminFor?.player1?.name} vs {adminFor?.player2?.name}
        </DialogTitle>
        <DialogContent>
          {adminFor && (adminFor.status === 'completed' || adminFor.status === 'walkover') && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This replaces the current result. Any rating change from it is reversed.
            </Alert>
          )}
          <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)} sx={{ mb: 2 }}>
            <Tab value="result" label="Result" />
            <Tab value="walkover" label="Walkover" />
          </Tabs>
          {adminTab === 'result' ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {formatLabel(adminFormat)}. Confirmed immediately; ratings update as usual.
              </Typography>
              <GameScoresInput
                value={games}
                onChange={setGames}
                myLabel={first(adminFor?.player1?.name)}
                opponentName={first(adminFor?.player2?.name)}
                thirdPerson
                extraError={formatError(toGames(games), adminFormat)}
              />
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Who advances? No rating change.
              </Typography>
              <ToggleButtonGroup
                exclusive
                orientation="vertical"
                fullWidth
                value={walkoverWinner}
                onChange={(_, v) => setWalkoverWinner(v)}
              >
                {[adminFor?.player1, adminFor?.player2].map(
                  (p) =>
                    p && (
                      <ToggleButton key={p.id} value={p.id}>
                        {p.name}
                      </ToggleButton>
                    )
                )}
              </ToggleButtonGroup>
            </>
          )}
          {dialogError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {dialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdminFor(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitAdmin}
            disabled={adminTab === 'walkover' ? !walkoverWinner : !!formatError(toGames(games), adminFormat)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!flash} autoHideDuration={4000} onClose={() => setFlash(null)}>
        <Alert severity="success" variant="filled" onClose={() => setFlash(null)}>
          {flash}
        </Alert>
      </Snackbar>
    </Box>
  );
}

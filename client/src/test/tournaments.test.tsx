import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { api, type AdminUser, type BracketMatch, type BracketRound, type Match } from '../api/client';
import Bracket from '../components/Bracket';
import { formatError } from '../lib/format';
import AdminPage from '../pages/AdminPage';

const authUser = { current: { id: 1, email: 'owner@slalom.com', display_name: 'Owner', rating: 1200, is_admin: true, is_owner: true } };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser.current }) }));

afterEach(() => vi.restoreAllMocks());

const P = (id: number, name: string, seed: number | null = null) => ({ id, name, rating: 1200, seed });

const pendingMatch = (awaiting: number) =>
  ({ id: 99, status: 'pending', awaiting_user_id: awaiting, games: [], player_a: P(1, 'Me'), player_b: P(2, 'Bob') }) as unknown as Match;

function bm(id: number, partial: Partial<BracketMatch>): BracketMatch {
  return { id, round: 1, position: 0, status: 'waiting', player1: null, player2: null, winner_id: null, result: null, pending: null, ...partial };
}

describe('Bracket', () => {
  const rounds: BracketRound[] = [
    {
      round: 1,
      name: 'Semifinals',
      best_of: 3,
      matches: [
        bm(1, { status: 'ready', player1: P(1, 'Me', 1), player2: P(4, 'Dana') }),
        bm(2, { status: 'ready', position: 1, player1: P(2, 'Bob', 2), player2: P(3, 'Cleo'), pending: pendingMatch(3) }),
      ],
    },
    { round: 2, name: 'Final', best_of: 5, matches: [bm(3, { round: 2 })] },
  ];

  it('shows rounds, formats, seeds and the right action per match', async () => {
    const onRecord = vi.fn();
    render(<Bracket rounds={rounds} userId={1} isAdmin={false} onRecord={onRecord} onReview={vi.fn()} onAdmin={vi.fn()} />);
    expect(screen.getByText('Semifinals')).toBeInTheDocument();
    expect(screen.getByText('Best of 5')).toBeInTheDocument();
    expect(screen.getAllByText('TBD')).toHaveLength(2);

    const mine = screen.getByTestId('bracket-match-1');
    expect(within(mine).getByText('1')).toBeInTheDocument(); // seed
    await userEvent.click(within(mine).getByRole('button', { name: 'Record result' }));
    expect(onRecord).toHaveBeenCalledWith(rounds[0].matches[0]);

    // Other players' match with a pending result
    const other = screen.getByTestId('bracket-match-2');
    expect(within(other).getByText('Awaiting confirmation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Admin/ })).not.toBeInTheDocument();
  });

  it('lets the awaited player review, and admins edit', async () => {
    const onReview = vi.fn();
    const onAdmin = vi.fn();
    render(<Bracket rounds={rounds} userId={3} isAdmin onRecord={vi.fn()} onReview={onReview} onAdmin={onAdmin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Review result' }));
    expect(onReview).toHaveBeenCalled();
    const adminButtons = screen.getAllByRole('button', { name: /Admin: set result/ });
    expect(adminButtons).toHaveLength(2); // ready matches only, not the waiting final
    await userEvent.click(adminButtons[0]);
    expect(onAdmin).toHaveBeenCalledWith(rounds[0].matches[0]);
  });

  it('hides all actions when read-only (cancelled tournament)', () => {
    render(<Bracket rounds={rounds} userId={1} isAdmin readOnly onRecord={vi.fn()} onReview={vi.fn()} onAdmin={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Record result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Admin/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument();
  });

  it('shows byes and walkovers', () => {
    const r: BracketRound[] = [
      {
        round: 1,
        name: 'Final',
        best_of: 1,
        matches: [
          bm(1, { status: 'bye', player1: P(1, 'Ann', 1), winner_id: 1 }),
          bm(2, { status: 'walkover', position: 1, player1: P(2, 'Bob'), player2: P(3, 'Cy'), winner_id: 3 }),
        ],
      },
    ];
    render(<Bracket rounds={r} userId={9} isAdmin={false} onRecord={vi.fn()} onReview={vi.fn()} onAdmin={vi.fn()} />);
    expect(screen.getByText('Bye')).toBeInTheDocument();
    expect(screen.getByText('W/O')).toBeInTheDocument();
  });
});

describe('formatError', () => {
  it('enforces the round format', () => {
    expect(formatError([{ me: 11, them: 5 }], 1)).toBeNull();
    expect(formatError([{ me: 11, them: 5 }], 3)).toMatch(/best of 3/);
    expect(formatError([{ me: 11, them: 5 }, { me: 11, them: 5 }], 1)).toMatch(/single game/);
  });
});

describe('AdminPage roles', () => {
  const users: AdminUser[] = [
    { id: 1, email: 'owner@slalom.com', display_name: 'Owner', rating: 1200, has_password: true, must_change_password: false, is_admin: true, is_owner: true, created_at: '' },
    { id: 2, email: 'adm@slalom.com', display_name: 'Adam', rating: 1200, has_password: true, must_change_password: false, is_admin: true, is_owner: false, created_at: '' },
    { id: 3, email: 'pat@slalom.com', display_name: 'Pat', rating: 1200, has_password: true, must_change_password: false, is_admin: false, is_owner: false, created_at: '' },
  ];

  it('owners can grant and revoke admin', async () => {
    authUser.current = { ...authUser.current, id: 1, is_owner: true };
    vi.spyOn(api, 'adminUsers').mockResolvedValue(users);
    const setAdmin = vi.spyOn(api, 'setAdmin').mockResolvedValue({ id: 3, is_admin: true });
    render(<AdminPage />);

    expect(await screen.findByRole('button', { name: 'Revoke admin' })).toBeInTheDocument();
    // Owner row has no role/reset actions; the owner can reset both the admin and the player
    expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make admin' }));
    expect(setAdmin).toHaveBeenCalledWith(3, true);
  });

  it('admins cannot change roles or reset other admins', async () => {
    authUser.current = { ...authUser.current, id: 2, is_owner: false };
    vi.spyOn(api, 'adminUsers').mockResolvedValue(users);
    render(<AdminPage />);
    expect(await screen.findByText('Pat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(1); // only Pat
  });
});

describe('TournamentFormPage', () => {
  it('blocks saving when a date is cleared', async () => {
    const { default: TournamentFormPage } = await import('../pages/TournamentFormPage');
    const { MemoryRouter } = await import('react-router-dom');
    const create = vi.spyOn(api, 'createTournament');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TournamentFormPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Name'), 'Winter Cup');
    const save = screen.getByRole('button', { name: 'Create tournament' });
    expect(save).toBeEnabled();
    await user.clear(screen.getByLabelText('Sign-up deadline'));
    expect(save).toBeDisabled();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PendingMatchCard corrections for tournament matches', () => {
  it('enforces the round format and shows server errors inside the dialog', async () => {
    const { default: PendingMatchCard } = await import('../components/PendingMatchCard');
    const { ApiError } = await import('../api/client');
    const m = {
      id: 7,
      status: 'pending',
      played_at: '2026-10-16T12:00:00Z',
      created_at: '2026-10-16T12:00:00Z',
      confirmed_at: null,
      player_a: P(2, 'Bob Smith'),
      player_b: P(1, 'Me'),
      winner_id: 2,
      submitted_by: 2,
      awaiting_user_id: 1,
      parent_match_id: null,
      games: [
        { a: 11, b: 7 },
        { a: 11, b: 9 },
      ],
      rating_a_before: null,
      rating_b_before: null,
      rating_a_after: null,
      rating_b_after: null,
      tournament: { id: 3, name: 'Cup', round_name: 'Final', best_of: 3 },
      judged_by: null,
    } as Match;
    const counter = vi.spyOn(api, 'counter').mockRejectedValue(new ApiError(409, 'This tournament was cancelled'));
    const user = userEvent.setup();
    render(<PendingMatchCard match={m} userId={1} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Propose correction' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Best of 3/)).toBeInTheDocument();

    // Reduce to a single game: valid as a regular match, but not for a best-of-3 round
    await user.click(within(dialog).getByRole('button', { name: 'Remove game 2' }));
    const send = within(dialog).getByRole('button', { name: 'Send correction' });
    expect(send).toBeDisabled();
    expect(within(dialog).getByText(/best of 3/)).toBeInTheDocument();

    // Back to a valid best-of-3 result; a server rejection is shown inside the dialog
    await user.click(within(dialog).getByRole('button', { name: /Add game/ }));
    await user.type(within(dialog).getByLabelText('Game 2 my score'), '11');
    await user.type(within(dialog).getByLabelText('Game 2 opponent score'), '5');
    await user.click(within(dialog).getByRole('button', { name: /Add game/ }));
    await user.type(within(dialog).getByLabelText('Game 3 my score'), '11');
    await user.type(within(dialog).getByLabelText('Game 3 opponent score'), '8');
    expect(send).toBeEnabled();
    await user.click(send);
    expect(counter).toHaveBeenCalled();
    expect(await within(screen.getByRole('dialog')).findByText('This tournament was cancelled')).toBeInTheDocument();
  });
});

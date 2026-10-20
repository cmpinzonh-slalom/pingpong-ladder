import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { api, type LeaderboardRow, type Match } from '../api/client';
import MatchRow from '../components/MatchRow';
import RecordMatchPage from '../pages/RecordMatchPage';

const authUser = { current: { id: 1, email: 'ada@slalom.com', display_name: 'Ada', rating: 1200, is_admin: true, is_owner: false } };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser.current }) }));

afterEach(() => vi.restoreAllMocks());

const row = (id: number, name: string): LeaderboardRow => ({ id, name, rating: 1200, wins: 0, losses: 0, played: 0 });
const PLAYERS = [row(1, 'Ada'), row(2, 'Alice Smith'), row(3, 'Bob Jones'), row(4, 'Cleo Park')];

function renderPage() {
  vi.spyOn(api, 'users').mockResolvedValue(PLAYERS);
  return render(
    <MemoryRouter>
      <RecordMatchPage />
    </MemoryRouter>
  );
}

describe('RecordMatchPage judge mode', () => {
  it('is only offered to admins', async () => {
    authUser.current = { ...authUser.current, is_admin: false };
    renderPage();
    expect(screen.queryByRole('switch', { name: /Judge mode/ })).not.toBeInTheDocument();
    authUser.current = { ...authUser.current, is_admin: true };
  });

  it('records a result for two other players after confirmation', async () => {
    const judge = vi.spyOn(api, 'judgeMatch').mockResolvedValue({} as Match);
    const create = vi.spyOn(api, 'createMatch');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('switch', { name: /Judge mode/ }));
    expect(screen.getByText(/counts immediately/)).toBeInTheDocument();

    // Player 1 picker excludes the admin
    await user.click(screen.getByRole('combobox', { name: 'Player 1' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByText('Ada (1200)')).not.toBeInTheDocument();
    await user.click(within(listbox).getByText('Alice Smith (1200)'));

    // Player 2 picker excludes the admin and Player 1
    await user.click(screen.getByRole('combobox', { name: 'Player 2' }));
    const list2 = await screen.findByRole('listbox');
    expect(within(list2).queryByText('Alice Smith (1200)')).not.toBeInTheDocument();
    expect(within(list2).queryByText('Ada (1200)')).not.toBeInTheDocument();
    await user.click(within(list2).getByText('Bob Jones (1200)'));

    // Score columns are labelled with the players; Bob wins this single game
    await user.type(screen.getByLabelText('Game 1 my score'), '7');
    await user.type(screen.getByLabelText('Game 1 opponent score'), '11');
    expect(screen.getByText('Bob wins 1–0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Record result \(no confirmation needed\)/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Bob Jones wins/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record result' }));

    expect(judge).toHaveBeenCalledWith(2, 3, [{ a: 7, b: 11 }], expect.any(String));
    expect(create).not.toHaveBeenCalled();
  });
});

const judgedMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 50,
  status: 'confirmed',
  played_at: '2026-10-16T12:00:00Z',
  created_at: '2026-10-16T12:00:00Z',
  confirmed_at: '2026-10-16T12:00:00Z',
  player_a: { id: 2, name: 'Alice Smith', rating: 1216 },
  player_b: { id: 3, name: 'Bob Jones', rating: 1184 },
  winner_id: 2,
  submitted_by: 1,
  awaiting_user_id: null,
  parent_match_id: null,
  games: [{ a: 11, b: 5 }],
  rating_a_before: 1200,
  rating_b_before: 1200,
  rating_a_after: 1216,
  rating_b_after: 1184,
  tournament: null,
  judged_by: { id: 1, name: 'Ada' },
  ...overrides,
});

describe('MatchRow judged matches', () => {
  it('shows who judged it and lets admins void it', async () => {
    const voidMatch = vi.spyOn(api, 'voidMatch').mockResolvedValue(judgedMatch({ status: 'voided' }));
    const onVoided = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MatchRow match={judgedMatch()} onVoided={onVoided} />
      </MemoryRouter>
    );
    expect(screen.getByText('Judged by Ada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Void judged result' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Void result' }));
    expect(voidMatch).toHaveBeenCalledWith(50);
    expect(onVoided).toHaveBeenCalled();
  });

  it('hides Void for non-admins and for regular matches', () => {
    authUser.current = { ...authUser.current, is_admin: false };
    const { unmount } = render(
      <MemoryRouter>
        <MatchRow match={judgedMatch()} onVoided={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Judged by Ada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void judged result' })).not.toBeInTheDocument();
    unmount();

    authUser.current = { ...authUser.current, is_admin: true };
    render(
      <MemoryRouter>
        <MatchRow match={judgedMatch({ judged_by: null })} onVoided={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Judged by/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void judged result' })).not.toBeInTheDocument();
  });
});

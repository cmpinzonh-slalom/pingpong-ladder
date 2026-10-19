import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { api, type Match } from '../api/client';
import PendingMatchCard from '../components/PendingMatchCard';
import RecordMatchPage from '../pages/RecordMatchPage';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'me@slalom.com', display_name: 'Me', rating: 1200 } }),
}));

const baseMatch: Match = {
  id: 10,
  status: 'pending',
  played_at: '2026-10-16T12:00:00Z',
  created_at: '2026-10-16T12:00:00Z',
  confirmed_at: null,
  player_a: { id: 2, name: 'Bob Smith', rating: 1200 },
  player_b: { id: 1, name: 'Me', rating: 1200 },
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
  tournament: null,
};

afterEach(() => vi.restoreAllMocks());

describe('PendingMatchCard', () => {
  it('shows the result from my perspective and confirms', async () => {
    const confirm = vi.spyOn(api, 'confirm').mockResolvedValue({ ...baseMatch, status: 'confirmed' });
    const onChanged = vi.fn();
    render(<PendingMatchCard match={baseMatch} userId={1} onChanged={onChanged} />);

    expect(screen.getByText(/You lost to Bob Smith 0–2/)).toBeInTheDocument();
    expect(screen.getByText('7-11, 9-11')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirm).toHaveBeenCalledWith(10);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('only allows withdrawing when waiting on the opponent', () => {
    render(
      <PendingMatchCard match={{ ...baseMatch, awaiting_user_id: 2, submitted_by: 1 }} userId={1} onChanged={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for Bob Smith/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });
});

describe('RecordMatchPage', () => {
  it('submits a valid match', async () => {
    vi.spyOn(api, 'users').mockResolvedValue([
      { id: 1, name: 'Me', rating: 1200, wins: 0, losses: 0, played: 0 },
      { id: 2, name: 'Bob Smith', rating: 1210, wins: 1, losses: 0, played: 1 },
    ]);
    const create = vi.spyOn(api, 'createMatch').mockResolvedValue(baseMatch);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RecordMatchPage />
      </MemoryRouter>
    );

    const submit = screen.getByRole('button', { name: /Submit for confirmation/ });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Opponent' }));
    await user.click(await screen.findByText('Bob Smith (1210)'));

    await user.type(screen.getByLabelText('Game 1 my score'), '11');
    await user.type(screen.getByLabelText('Game 1 opponent score'), '6');
    // A single game is already a valid match
    expect(screen.getByText('You won 1–0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add game/ }));
    await user.type(screen.getByLabelText('Game 2 my score'), '13');
    await user.type(screen.getByLabelText('Game 2 opponent score'), '11');

    expect(screen.getByText('You won 2–0')).toBeInTheDocument();
    await user.click(submit);
    expect(create).toHaveBeenCalledWith(
      2,
      [
        { me: 11, them: 6 },
        { me: 13, them: 11 },
      ],
      expect.any(String)
    );
  });
});

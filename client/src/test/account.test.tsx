import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { api, ApiError, type Me } from '../api/client';
import AccountPage from '../pages/AccountPage';

const setUser = vi.fn();
const me: Me = {
  id: 1,
  email: 'jane.doe@slalom.com',
  display_name: 'Jane Doe',
  rating: 1200,
  is_admin: false,
  is_owner: false,
  must_change_password: false,
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: me, setUser }) }));

afterEach(() => {
  vi.restoreAllMocks();
  setUser.mockReset();
});

describe('AccountPage display name', () => {
  it('starts from the current name and only enables Save for a valid, changed name', async () => {
    const user = userEvent.setup();
    render(<AccountPage />);
    const field = screen.getByLabelText('Display name');
    const save = screen.getByRole('button', { name: 'Save name' });
    expect(field).toHaveValue('Jane Doe');
    expect(save).toBeDisabled(); // unchanged

    await user.clear(field);
    await user.type(field, 'J');
    expect(save).toBeDisabled();
    expect(screen.getByText('Use 2-40 characters')).toBeInTheDocument();

    await user.type(field, 'ane');
    expect(save).toBeEnabled();
  });

  it('saves the trimmed name and updates the signed-in user', async () => {
    const updated = { ...me, display_name: 'Janie D' };
    const updateMe = vi.spyOn(api, 'updateMe').mockResolvedValue(updated);
    const user = userEvent.setup();
    render(<AccountPage />);
    const field = screen.getByLabelText('Display name');
    await user.clear(field);
    await user.type(field, '  Janie   D ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(updateMe).toHaveBeenCalledWith('Janie D'); // trimmed, spaces collapsed
    expect(setUser).toHaveBeenCalledWith(updated);
    expect(await screen.findByText('Display name updated.')).toBeInTheDocument();
  });

  it('locks the field while saving so edits are not overwritten by the response', async () => {
    let resolve!: (m: Me) => void;
    vi.spyOn(api, 'updateMe').mockReturnValue(new Promise<Me>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AccountPage />);
    const field = screen.getByLabelText('Display name');
    await user.clear(field);
    await user.type(field, 'Janie');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    // While the request is in flight the field can't be edited
    expect(field).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    resolve({ ...me, display_name: 'Janie' });
    expect(await screen.findByText('Display name updated.')).toBeInTheDocument();
    expect(field).toBeEnabled();
    expect(field).toHaveValue('Janie');
  });

  it('shows the server error and does not update the user', async () => {
    vi.spyOn(api, 'updateMe').mockRejectedValue(new ApiError(400, 'Display name contains characters that are not allowed'));
    const user = userEvent.setup();
    render(<AccountPage />);
    const field = screen.getByLabelText('Display name');
    await user.clear(field);
    await user.type(field, 'Janie');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Display name contains characters that are not allowed')).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
  });
});

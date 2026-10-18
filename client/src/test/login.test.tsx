import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { api, type Me } from '../api/client';
import LoginPage from '../pages/LoginPage';

const setUser = vi.fn();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ setUser }) }));

const me: Me = {
  id: 1,
  email: 'jane.doe@slalom.com',
  display_name: 'Jane Doe',
  rating: 1200,
  is_admin: false,
  must_change_password: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  setUser.mockReset();
});

describe('LoginPage', () => {
  it('signs in with email and password', async () => {
    const login = vi.spyOn(api, 'login').mockResolvedValue(me);
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText(/Slalom email/), ' Jane.Doe@slalom.com');
    await user.type(screen.getByLabelText(/^Password/), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(login).toHaveBeenCalledWith('jane.doe@slalom.com', 'secret123');
    expect(setUser).toHaveBeenCalledWith(me);
  });

  it('registers with a suggested display name and validates passwords', async () => {
    const register = vi.spyOn(api, 'register').mockResolvedValue(me);
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText(/Slalom email/), 'jane.doe@slalom.com');
    expect(screen.getByLabelText(/Display name/)).toHaveValue('Jane Doe');

    await user.type(screen.getByLabelText(/^Password/), 'secret123');
    await user.type(screen.getByLabelText(/Confirm password/), 'different1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Confirm password/));
    await user.type(screen.getByLabelText(/Confirm password/), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(register).toHaveBeenCalledWith('jane.doe@slalom.com', 'secret123', 'Jane Doe');
  });

  it('rejects non-slalom emails on sign up', async () => {
    const register = vi.spyOn(api, 'register');
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText(/Slalom email/), 'jane@gmail.com');
    await user.type(screen.getByLabelText(/^Password/), 'secret123');
    await user.type(screen.getByLabelText(/Confirm password/), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Use your @slalom.com email address')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });
});

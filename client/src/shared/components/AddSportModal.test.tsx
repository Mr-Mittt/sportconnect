import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey } from '@/shared/types/sport';
import { AddSportModal } from './AddSportModal';

const baseProps = {
  isOpen: true,
  onClose: () => {},
  availableSports: ['basketball', 'tennis'] as SportKey[],
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
};

describe('AddSportModal', () => {
  it('lists only the available sports in the picker', () => {
    render(<AddSportModal {...baseProps} />);
    const select = screen.getByLabelText('Sport');
    expect(screen.getByRole('option', { name: 'Basketball' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tennis' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Football' })).not.toBeInTheDocument();
    expect(select).toHaveValue('basketball'); // defaults to the first available sport
  });

  it('disables submit until a skill level is chosen', async () => {
    const user = userEvent.setup();
    render(<AddSportModal {...baseProps} />);

    const submit = screen.getByRole('button', { name: 'Add sport' });
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Skill level'), 'intermediate');
    expect(submit).toBeEnabled();
  });

  it('submits the sportId mapped from the picked sport, skill level, and years of experience', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddSportModal {...baseProps} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Sport'), 'tennis');
    await user.selectOptions(screen.getByLabelText('Skill level'), 'advanced');
    await user.type(screen.getByLabelText('Years of experience (optional)'), '5');
    await user.click(screen.getByRole('button', { name: 'Add sport' }));

    expect(onSubmit).toHaveBeenCalledWith({ sportId: 2, skillLevel: 'advanced', yearsOfExperience: 5 });
  });

  it('omits yearsOfExperience when left blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddSportModal {...baseProps} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Skill level'), 'beginner');
    await user.click(screen.getByRole('button', { name: 'Add sport' }));

    expect(onSubmit).toHaveBeenCalledWith({ sportId: 6, skillLevel: 'beginner', yearsOfExperience: undefined });
  });

  it('shows a safety-net message and no picker when no sports are available', () => {
    render(<AddSportModal {...baseProps} availableSports={[]} />);
    expect(screen.queryByLabelText('Sport')).not.toBeInTheDocument();
    expect(screen.getByText(/already have a profile for every sport/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add sport' })).toBeDisabled();
  });

  it('shows an "Adding…" label and disables submit while submitting', async () => {
    const user = userEvent.setup();
    render(<AddSportModal {...baseProps} isSubmitting />);
    await user.selectOptions(screen.getByLabelText('Skill level'), 'beginner');
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('shows an error message when isError is true', () => {
    render(<AddSportModal {...baseProps} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't add that sport");
  });
});

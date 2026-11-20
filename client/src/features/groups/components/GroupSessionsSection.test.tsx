import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GroupSessionsSection } from './GroupSessionsSection';

function setup(defaultOpen: boolean) {
  render(
    <GroupSessionsSection title="Other sessions" defaultOpen={defaultOpen} filter={<button type="button">Status (2)</button>}>
      <p>the body</p>
    </GroupSessionsSection>,
  );
}

describe('GroupSessionsSection (CLIENT-GROUP-SESSION-2)', () => {
  it('shows its body when it starts open', () => {
    setup(true);
    expect(screen.getByRole('region', { name: 'Other sessions' })).toBeInTheDocument();
    expect(screen.getByText('the body')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Other sessions' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides its body when it starts collapsed, but keeps the title and the filter in the header', () => {
    setup(false);
    expect(screen.queryByText('the body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other sessions' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Status (2)' })).toBeVisible();
  });

  it('the title toggles it, and opening it does not touch the filter', async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole('button', { name: 'Other sessions' }));
    expect(screen.getByText('the body')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Other sessions' }));
    expect(screen.queryByText('the body')).not.toBeInTheDocument();
  });

  it('puts the filter to the left of the chevron, both after the title', () => {
    setup(true);
    const header = screen.getByRole('button', { name: 'Other sessions' }).parentElement as HTMLElement;
    const order = Array.from(header.querySelectorAll('button')).map((button) => button.textContent || button.getAttribute('data-slot'));
    expect(order).toEqual(['Other sessions', 'Status (2)', 'collapsible-chevron']);
  });

  it('clicking the filter does not collapse the section', async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole('button', { name: 'Status (2)' }));
    expect(screen.getByText('the body')).toBeVisible();
  });
});

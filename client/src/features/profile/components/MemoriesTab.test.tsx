import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoriesTab } from './MemoriesTab';

describe('MemoriesTab', () => {
  it('renders the ComingSoonPage placeholder for Memories', () => {
    render(<MemoriesTab />);
    expect(screen.getByRole('heading', { name: 'Memories' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationMapPreview } from './LocationMapPreview';

describe('LocationMapPreview', () => {
  it('renders a map container at the given coordinates', () => {
    render(<LocationMapPreview latitude={21.0285} longitude={105.8542} onMove={() => {}} mapSeed={0} />);
    expect(screen.getByTestId('location-map-preview')).toBeInTheDocument();
  });
});

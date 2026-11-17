import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostFields } from './SessionSectionFields';

describe('CostFields layout (CLIENT-GL-51)', () => {
  it('puts every fee option in the left column and the fee note in the right one', () => {
    render(
      <CostFields
        idPrefix="t"
        feeType={undefined}
        onFeeTypeChange={() => {}}
        feeAmount=""
        onFeeAmountChange={() => {}}
        feeNote=""
        onFeeNoteChange={() => {}}
      />,
    );
    const columns = screen.getByTestId('cost-columns');
    expect(columns).toHaveClass('@sm:grid-cols-2');
    expect(columns.children).toHaveLength(2);
    const [left, right] = Array.from(columns.children) as HTMLElement[];
    // Free, Split cost and the Fixed amount input: all three options, none in the right column.
    expect(within(left).getByRole('checkbox', { name: 'Free' })).toBeInTheDocument();
    expect(within(left).getByRole('checkbox', { name: 'Split cost' })).toBeInTheDocument();
    expect(within(left).getByLabelText('Fixed amount')).toBeInTheDocument();
    expect(within(left).queryByLabelText('Fee note')).not.toBeInTheDocument();
    expect(within(right).getByLabelText('Fee note')).toBeInTheDocument();
    expect(within(right).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

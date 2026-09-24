import { Popover, PopoverContent } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { FEE_TYPE_LABEL } from '@/shared/lib/feeType';
import type { FeeType } from '@/shared/types/session';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';
import { VndAmountInput } from './FeeTypeFields';

interface DiscoverFeeFilterProps {
  feeType: FeeType | undefined;
  onToggleFeeType: (feeType: FeeType) => void;
  maxFeeAmountVndText: string;
  onMaxFeeAmountVndChange: (value: string) => void;
  onClear: () => void;
}

const FEE_TYPES: FeeType[] = ['FREE', 'SPLIT', 'FIXED'];

/**
 * CLIENT-SESSION-29's Fee filter — `feeType` is a checkbox-styled toggle (clicking the
 * already-checked one clears it, same mutual-exclusivity precedent `DiscoverTimeFilter`'s
 * Before/After already established) since the server param is a single value, not a list, unlike
 * every other Discover checklist filter here. `maxFeeAmountVnd` is a separate, independent
 * ceiling — see `DiscoverFilters`' own doc comment for why it isn't gated on `feeType === 'FIXED'`.
 */
export function DiscoverFeeFilter({
  feeType,
  onToggleFeeType,
  maxFeeAmountVndText,
  onMaxFeeAmountVndChange,
  onClear,
}: DiscoverFeeFilterProps) {
  const trimmedAmount = maxFeeAmountVndText.trim();
  const isSet = feeType !== undefined || trimmedAmount !== '';
  // 2026-09-23 revision — the label reflects whichever of feeType/maxFeeAmountVnd is set, not
  // just feeType: a caller who only set a max amount previously saw a plain "Fee" trigger with no
  // indication anything was filtered. A later revision (same day) dropped the "Fee " prefix once
  // set — the trigger shows the selected value alone, same as Status.
  const labelParts = [
    feeType !== undefined ? FEE_TYPE_LABEL[feeType] : undefined,
    trimmedAmount !== '' ? `<=${trimmedAmount} VND` : undefined,
  ].filter((part): part is string => part !== undefined);
  const triggerLabel = labelParts.length > 0 ? labelParts.join(', ') : 'Fee';

  return (
    <Popover>
      <DiscoverFilterTrigger
        label={triggerLabel}
        isActive={isSet}
        onClear={onClear}
        clearLabel="Clear fee filter"
      />
      <PopoverContent align="start" className="w-56">
        <div className="flex flex-col gap-2">
          <fieldset className="flex flex-col gap-0.5">
            <legend className="sr-only">Fee type</legend>
            {FEE_TYPES.map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2sm text-text-primary hover:bg-surface-1"
              >
                <input
                  type="checkbox"
                  checked={feeType === type}
                  onChange={() => onToggleFeeType(type)}
                  className="size-4 accent-accent-solid"
                />
                {FEE_TYPE_LABEL[type]}
              </label>
            ))}
          </fieldset>
          <div className="flex items-center gap-2 px-2">
            <Label htmlFor="discover-max-fee-amount" className="mb-0 shrink-0 text-2xs">
              Max amount
            </Label>
            <VndAmountInput
              id="discover-max-fee-amount"
              value={maxFeeAmountVndText}
              onChange={onMaxFeeAmountVndChange}
              placeholder="VND"
            />
          </div>
          {isSet && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

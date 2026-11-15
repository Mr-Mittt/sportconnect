import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface CopyRecordIdButtonProps {
  /** The record's real id (the one `:upd` and `:del` take), not its position in the list. */
  recordId: number;
  /** `aria-label` and tooltip: icon only, no visible text. */
  label: string;
}

const CONFIRM_MS = 1500;

/**
 * CLIENT-GL-39: puts a record's real id on the clipboard so the user can paste it after `:upd` or `:del`. The Result
 * section shows no record numbers any more (the display position shifts after a delete), so this is how an id is
 * found. The icon turns into a check for a moment once copied; a browser that refuses clipboard access changes nothing.
 */
export function CopyRecordIdButton({ recordId, label }: CopyRecordIdButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(recordId));
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void copy()}
      className={cn(
        'flex size-6 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-surface-1 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
        copied && 'text-text-success',
      )}
    >
      {copied ? (
        <IconCheck className="size-3.5" aria-hidden="true" />
      ) : (
        <IconCopy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

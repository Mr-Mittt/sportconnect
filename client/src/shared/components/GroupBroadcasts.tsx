import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import type { GroupBroadcast } from '@/shared/types/rail';

interface GroupBroadcastsProps {
  broadcasts: GroupBroadcast[];
  onBroadcastClick: (broadcastId: number) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * Right-rail "Group broadcasts" card — owner/admin announcements from the
 * user's groups, read-only here. Rows are clickable per the spec's acceptance
 * criteria (the mockup's static rows are superseded — HF-6 decision). Global,
 * not filtered by activeSport (epic open question #1, same call as HF-5).
 * Real (FEED-7).
 *
 * FEED-8: `isLoading` renders 2 row skeletons; `isError` renders a retry
 * block in place of the row list.
 */
export function GroupBroadcasts({
  broadcasts,
  onBroadcastClick,
  isLoading,
  isError,
  onRetry,
}: GroupBroadcastsProps) {
  return (
    <section
      aria-label="Group broadcasts"
      className="border-hairline rounded-xl border-border bg-surface-2 p-3.5"
    >
      <h2 className="mb-2.5 text-2sm font-medium text-text-primary">Group broadcasts</h2>

      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.25">
            <Skeleton className="size-7.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="flex items-center gap-2.25">
            <Skeleton className="size-7.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-1.5 py-1">
          <p className="text-xs text-text-danger">Couldn't load group broadcasts.</p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded border-hairline border-border px-2.5 py-1 text-xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Retry
          </button>
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="py-2 text-xs text-text-muted">No broadcasts from your groups.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {broadcasts.map((broadcast) => (
            <button
              key={broadcast.id}
              type="button"
              onClick={() => onBroadcastClick(broadcast.id)}
              className="flex w-full cursor-pointer gap-2.25 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <span
                className={cn(
                  'flex size-7.5 shrink-0 items-center justify-center rounded-full text-2xs font-medium',
                  getRampBadgeClasses(broadcast.colorRamp),
                )}
              >
                {broadcast.groupInitials}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-text-primary">
                  {broadcast.groupName}{' '}
                  <span className="font-normal text-text-muted">
                    {formatRelativeTime(broadcast.createdAt)}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs leading-snug text-text-secondary">
                  {broadcast.text}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

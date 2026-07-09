import { IconBallFootball } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { CommunityIllustration } from './CommunityIllustration';

interface AuthShellProps {
  children: ReactNode;
}

/**
 * Two-column card shell shared by Login and Register (per
 * design-reference-login.html and AUTH-1's delta: "the left-panel two-column
 * card layout is shared with AUTH-2's Register page"). Illustration + tagline
 * on the left, `children` (the form) on the right.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="shadow-card grid w-[900px] max-w-full grid-cols-1 overflow-hidden rounded-2xl border-hairline border-border bg-surface-2 md:grid-cols-2">
        <div className="border-hairline-r hidden min-h-[520px] flex-col justify-between border-border p-10 md:flex">
          <div className="flex items-center justify-end gap-2 text-4xl font-semibold tracking-tight">
            <span className="bg-border-accent flex size-[26px] items-center justify-center rounded-[7px]">
              <IconBallFootball className="size-4 text-white" aria-hidden="true" />
            </span>
            SportHub
          </div>
          <div className="flex flex-1 items-center justify-center">
            <CommunityIllustration />
          </div>
          <p className="max-w-[320px] text-2xl font-semibold tracking-tight text-text-primary">
            Your teams, matches, and crew — all in one place.
          </p>
        </div>

        <div className="flex flex-col justify-center p-9">{children}</div>
      </div>
    </div>
  );
}

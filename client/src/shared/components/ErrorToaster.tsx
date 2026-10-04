import type { CSSProperties } from 'react';
import { Toaster } from 'sonner';

// sonner's own theming variables, pointed at the app's design tokens (never a hardcoded color).
const TOAST_STYLE = {
  '--normal-bg': 'var(--color-surface-2)',
  '--normal-text': 'var(--color-text-primary)',
  '--normal-border': 'var(--color-border-strong)',
  '--error-bg': 'var(--color-surface-2)',
  '--error-text': 'var(--color-text-danger)',
  '--error-border': 'var(--color-border-strong)',
} as CSSProperties;

/**
 * CLIENT-ERR-1: the single toast host, mounted once in `RootLayout`. Toasts come from
 * `showErrorToast` (the global mutation-failure handler); sonner renders an `aria-live` region, so
 * screen readers announce them. Light theme only — the app has no dark mode.
 */
export function ErrorToaster() {
  return <Toaster position="bottom-center" duration={5000} theme="light" style={TOAST_STYLE} />;
}

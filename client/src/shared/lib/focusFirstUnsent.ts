/**
 * "Keep editing" after the leave question (owner, 2026-11-16): the caret goes back to what was typed and not sent. A box
 * that holds unsent text marks itself `data-unsent="true"` (`MentionInput`, the plain reply input); inside `scope`
 * (a CSS selector for the page or modal the question was about) the first of them in document order, so the comment
 * box before the reply boxes under it, takes the focus with the caret at the end of its text.
 */
export function focusFirstUnsent(scope: string): void {
  const box = document.querySelector<HTMLElement>(`${scope} [data-unsent="true"]`);
  if (box === null) return;
  box.focus();
  if (box instanceof HTMLInputElement) {
    box.setSelectionRange(box.value.length, box.value.length);
    return;
  }
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

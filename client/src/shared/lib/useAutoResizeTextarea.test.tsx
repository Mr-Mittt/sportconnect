import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from '@/shared/ui/textarea';
import { useAutoResizeTextarea } from './useAutoResizeTextarea';

// jsdom never computes real layout (scrollHeight is always 0), so this
// stubs it per-render to simulate content growing past one line — the
// actual mechanism under test is whether the ref reaches the real
// <textarea> node at all (CHAT-15 found live: it silently didn't, because
// the shared Textarea component wasn't wrapped in React.forwardRef, so
// ref.current stayed null and this hook's effect was a permanent no-op
// with no error anywhere a class-list-only test would have caught).
function TestField({ value, scrollHeight }: { value: string; scrollHeight: number }) {
  const ref = useAutoResizeTextarea(value);
  return (
    <Textarea
      ref={(node) => {
        ref.current = node;
        if (node)
          Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
      }}
      value={value}
      onChange={() => {}}
      aria-label="Test field"
    />
  );
}

describe('useAutoResizeTextarea', () => {
  it('actually reaches the underlying textarea node (guards the forwardRef regression) and sets its height from scrollHeight', () => {
    const { getByLabelText } = render(<TestField value="one line" scrollHeight={20} />);
    const node = getByLabelText('Test field') as HTMLTextAreaElement;
    expect(node.style.height).toBe('20px');
  });

  it('grows as content grows, up to the max height', () => {
    const { getByLabelText, rerender } = render(<TestField value="one line" scrollHeight={20} />);
    rerender(<TestField value={'line\n'.repeat(10)} scrollHeight={200} />);

    const node = getByLabelText('Test field') as HTMLTextAreaElement;
    expect(node.style.height).toBe('120px'); // clamped at the hook's default max
    expect(node.style.overflowY).toBe('auto'); // scrolls internally once clamped
  });

  it('shrinks back down when content shrinks (e.g. draft cleared after sending)', () => {
    const { getByLabelText, rerender } = render(
      <TestField value={'line\n'.repeat(10)} scrollHeight={200} />,
    );
    rerender(<TestField value="" scrollHeight={20} />);

    const node = getByLabelText('Test field') as HTMLTextAreaElement;
    expect(node.style.height).toBe('20px');
    expect(node.style.overflowY).toBe('hidden');
  });
});

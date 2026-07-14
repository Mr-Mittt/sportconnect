import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScrollSentinel } from './useInfiniteScrollSentinel';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function TestSentinel({ onIntersect, enabled }: { onIntersect: () => void; enabled: boolean }) {
  const ref = useInfiniteScrollSentinel(onIntersect, enabled);
  return <div data-testid="sentinel" ref={ref} />;
}

describe('useInfiniteScrollSentinel', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('calls onIntersect when the sentinel intersects while enabled', () => {
    const onIntersect = vi.fn();
    render(<TestSentinel onIntersect={onIntersect} enabled />);

    const [observer] = FakeIntersectionObserver.instances;
    expect(observer.observe).toHaveBeenCalled();

    observer.trigger(true);
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it('does not call onIntersect when not actually intersecting', () => {
    const onIntersect = vi.fn();
    render(<TestSentinel onIntersect={onIntersect} enabled />);

    const [observer] = FakeIntersectionObserver.instances;
    observer.trigger(false);
    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('does not observe at all when disabled', () => {
    const onIntersect = vi.fn();
    render(<TestSentinel onIntersect={onIntersect} enabled={false} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('disconnects the observer on unmount', () => {
    const onIntersect = vi.fn();
    const { unmount } = render(<TestSentinel onIntersect={onIntersect} enabled />);

    const [observer] = FakeIntersectionObserver.instances;
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});

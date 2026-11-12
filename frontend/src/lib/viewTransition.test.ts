import { afterEach, describe, expect, it, vi } from 'vitest';
import { withViewTransition } from './viewTransition';

function stubStart(start: unknown) {
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
}

describe('withViewTransition', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
    vi.unstubAllGlobals();
  });

  it('just runs the update where the browser has no view transitions', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it('hands the update to the browser where it has them', () => {
    const start = vi.fn(() => ({ ready: Promise.resolve(), finished: Promise.resolve() }));
    stubStart(start);
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledWith(update);
    expect(update).not.toHaveBeenCalled();
  });

  it('skips the animation under reduced motion', () => {
    const start = vi.fn();
    stubStart(start);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

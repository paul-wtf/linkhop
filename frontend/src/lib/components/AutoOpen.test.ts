import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AutoOpen from './AutoOpen.svelte';

describe('AutoOpen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down and then navigates', async () => {
    const navigate = vi.fn();
    const { getByText } = render(AutoOpen, {
      props: { url: 'https://tidal/track/2', serviceName: 'Tidal', navigate }
    });
    expect(getByText(/Weiter zu Tidal in 3/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(navigate).not.toHaveBeenCalled();
    expect(getByText(/Weiter zu Tidal in 1/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1000);
    expect(navigate).toHaveBeenCalledWith('https://tidal/track/2');
  });

  it('stays on the page after cancel', async () => {
    const navigate = vi.fn();
    const { getByRole, queryByText } = render(AutoOpen, {
      props: { url: 'https://tidal/track/2', serviceName: 'Tidal', navigate }
    });
    await fireEvent.click(getByRole('button', { name: 'Abbrechen' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(navigate).not.toHaveBeenCalled();
    expect(queryByText(/Weiter zu Tidal/)).toBeNull();
  });
});

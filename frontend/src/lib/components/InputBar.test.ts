import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputBar from './InputBar.svelte';

describe('InputBar', () => {
  it('dispatches submit with url on button click', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    const input = getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'https://x' } });
    await fireEvent.click(getByRole('button', { name: /konvertieren/i }));
    expect(handler).toHaveBeenCalledWith({ url: 'https://x' });
  });

  it('dispatches submit on Enter', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    const input = getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'https://y' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(handler).toHaveBeenCalledWith({ url: 'https://y' });
  });

  it('does not submit empty value', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    await fireEvent.click(getByRole('button', { name: /konvertieren/i }));
    expect(handler).not.toHaveBeenCalled();
  });

  function paste(input: HTMLElement, text: string) {
    return fireEvent.paste(input, { clipboardData: { getData: () => text } });
  }

  it('submits a pasted link right away', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    await paste(getByRole('textbox'), ' https://open.spotify.com/track/abc ');
    expect(handler).toHaveBeenCalledWith({ url: 'https://open.spotify.com/track/abc' });
  });

  it('submits a pasted spotify URI', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    await paste(getByRole('textbox'), 'spotify:track:abc');
    expect(handler).toHaveBeenCalledWith({ url: 'spotify:track:abc' });
  });

  it('does not submit pasted text that is not a link', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    await paste(getByRole('textbox'), 'daft punk');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not submit a link pasted into existing text', async () => {
    const handler = vi.fn();
    const { getByRole } = render(InputBar, {
      props: { onsubmit: (detail: { url: string }) => handler(detail) }
    });
    const input = getByRole('textbox') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'https://x/?next=' } });
    input.setSelectionRange(input.value.length, input.value.length);
    await paste(input, 'https://open.spotify.com/track/abc');
    expect(handler).not.toHaveBeenCalled();
  });
});

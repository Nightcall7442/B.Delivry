import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/monitoring/report', () => ({ reportError }));

import GlobalError from './global-error';

// React 19 asks the test environment to say it understands `act`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

/** The page owns the whole document here (it replaces the root layout): so does the test. */
function show(error: Error & { digest?: string }) {
  root = createRoot(document);
  act(() => root?.render(<GlobalError error={error} />));
}

beforeEach(() => reportError.mockClear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('global-error', () => {
  it('reports the error once, however many times it draws again', () => {
    const error = new Error('the root layout failed');
    show(error);
    act(() => root?.render(<GlobalError error={error} />));
    act(() => root?.render(<GlobalError error={error} />));
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('reports a different error that replaces it', () => {
    show(new Error('first'));
    const second = new Error('second');
    act(() => root?.render(<GlobalError error={second} />));
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenLastCalledWith(second);
  });

  it('does not report a server-side failure again: it arrives with a digest and the server has reported it', () => {
    show(
      Object.assign(new Error('An error occurred in the Server Components render.'), {
        digest: '123',
      }),
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it('shows what it showed without the reporting: a message and a way to reload', () => {
    show(new Error('x'));
    expect(document.documentElement.lang).toBe('ru');
    expect(document.body.textContent).toContain('Что-то пошло не так');
    const button = document.querySelector('button');
    expect(button?.textContent).toBe('Обновить');
  });
});

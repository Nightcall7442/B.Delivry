import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/monitoring/report', () => ({ reportError }));

import DashboardError from './error';

// React 19 asks the test environment to say it understands `act`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function show(error: Error & { digest?: string }, reset: () => void = () => undefined) {
  act(() => root.render(<DashboardError error={error} reset={reset} />));
}

beforeEach(() => {
  reportError.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the desk’s error boundary', () => {
  it('reports the error once, however many times it draws again', () => {
    const error = new Error('orders page failed');
    show(error);
    show(error);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('does not report a server-side failure again: it arrives with a digest', () => {
    show(
      Object.assign(new Error('An error occurred in the Server Components render.'), {
        digest: '9',
      }),
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it('says what happened without the error’s own words, and tries again on request', () => {
    const reset = vi.fn();
    show(new Error('customer +998901234567 broke it'), reset);
    // The error's own words (here a customer's phone) are not put on the page.
    expect(container.textContent).toContain('Страница не открылась');
    expect(container.textContent).not.toContain('998901234567');
    container.querySelector('button')?.click();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

export function withViewTransition(update: () => Promise<void> | void): void {
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('startViewTransition' in document) || reduced) {
    void update();
    return;
  }
  // The browser skips a transition whose snapshot has two elements with the
  // same name, and reports that by rejecting `ready`. The update still ran.
  document.startViewTransition(update).ready.catch(() => {});
}

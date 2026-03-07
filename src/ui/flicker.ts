export function startFlicker(element: HTMLElement): () => void {
  let running = true;
  let rafId: number;

  function tick(): void {
    if (!running) return;
    element.style.opacity = String(0.97 + Math.random() * 0.03);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    element.style.opacity = '1';
  };
}

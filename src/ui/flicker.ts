export interface FlickerController {
  stop(): void;
  pulse(intensity: number, durationMs: number): void;
}

// Module-level singleton — survives screen navigations
let flickerController: FlickerController | null = null;

export function startFlicker(element: HTMLElement): FlickerController {
  let running = true;
  let rafId: number;

  // Baseline flicker range: 0.97–1.0
  let pulseUntil = 0;
  let pulseMinOpacity = 0.97;

  function tick(): void {
    if (!running) return;

    const now = performance.now();
    const inPulse = now < pulseUntil;
    const minOpacity = inPulse ? pulseMinOpacity : 0.97;

    // Range spans from minOpacity up to 1.0
    const range = 1.0 - minOpacity;
    element.style.opacity = String(minOpacity + Math.random() * range);

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  const controller: FlickerController = {
    stop(): void {
      running = false;
      cancelAnimationFrame(rafId);
      element.style.opacity = '1';
      if (flickerController === controller) {
        flickerController = null;
      }
    },

    pulse(intensity: number, durationMs: number): void {
      // intensity 0.0 = no change (baseline 0.97–1.0)
      // intensity 1.0 = maximum flicker (min opacity 0.85)
      // intensity 0.5 → minOpacity = 0.92
      const clampedIntensity = Math.max(0, Math.min(1, intensity));
      pulseMinOpacity = 0.97 - clampedIntensity * 0.12;
      pulseUntil = performance.now() + durationMs;
    },
  };

  flickerController = controller;
  return controller;
}

export function getFlickerController(): FlickerController | null {
  return flickerController;
}

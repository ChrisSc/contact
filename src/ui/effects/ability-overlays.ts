/**
 * ability-overlays.ts — Canvas-based full-screen ability deployment overlays.
 *
 * Each ability gets a visually distinct 2D canvas animation that plays over
 * the combat screen when the player deploys that ability. Animations are
 * time-based (progress 0→1) using requestAnimationFrame. Only one animation
 * runs at a time; calling play() while one is active cancels the previous.
 */

import { getFlickerController } from '../flicker';
import { getLogger } from '../../observability/logger';

export type AbilityOverlayType =
  | 'sonar_ping'
  | 'recon_drone'
  | 'radar_jammer'
  | 'silent_running'
  | 'depth_charge'
  | 'g_sonar'
  | 'acoustic_cloak';

// --- Easing helpers ---

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---------------------------------------------------------------------------

export class AbilityOverlayManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animId: number = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Cross-effect reference — set externally via setNoiseInstance()
  private static noiseInstance: { pulse(intensity: number, durationMs: number): void } | null =
    null;

  static setNoiseInstance(noise: { pulse(intensity: number, durationMs: number): void }): void {
    AbilityOverlayManager.noiseInstance = noise;
  }

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position: absolute; inset: 0; z-index: 50; pointer-events: none;';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('AbilityOverlayManager: cannot get 2d context');
    }
    this.ctx = ctx;
  }

  /**
   * Returns the canvas element. Append it to the combat screen container
   * once; the ResizeObserver will keep dimensions in sync with the parent.
   */
  render(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * After the canvas is appended to its parent container, wire up the
   * ResizeObserver so the canvas dimensions always match the viewport.
   */
  private attachResizeObserver(): void {
    if (this.resizeObserver) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.canvas.width = Math.round(width);
        this.canvas.height = Math.round(height);
      }
    });

    this.resizeObserver.observe(parent);

    // Set initial size immediately
    const rect = parent.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width);
    this.canvas.height = Math.round(rect.height);
  }

  /**
   * Play an ability overlay animation.
   *
   * Cancels any in-progress animation, then runs the effect for `type`.
   * `onComplete` is called after the animation finishes and the canvas is
   * cleared, or immediately if the animation completes naturally.
   */
  play(type: AbilityOverlayType, onComplete?: () => void): void {
    // Lazy-attach ResizeObserver on first play (parent should be in DOM by now)
    this.attachResizeObserver();

    // Cancel previous
    this.cancel();

    getLogger().emit('view.change', { action: 'ability_overlay', type, phase: 'start' });

    const wrappedComplete = (): void => {
      getLogger().emit('view.change', { action: 'ability_overlay', type, phase: 'complete' });
      onComplete?.();
    };

    switch (type) {
      case 'sonar_ping':
        this.playSonarPing(wrappedComplete);
        break;
      case 'recon_drone':
        this.playReconDrone(wrappedComplete);
        break;
      case 'radar_jammer':
        this.playRadarJammer(wrappedComplete);
        break;
      case 'silent_running':
        this.playSilentRunning(wrappedComplete);
        break;
      case 'depth_charge':
        this.playDepthCharge(wrappedComplete);
        break;
      case 'g_sonar':
        this.playGSonar(wrappedComplete);
        break;
      case 'acoustic_cloak':
        this.playAcousticCloak(wrappedComplete);
        break;
    }
  }

  /**
   * Stop any running animation immediately and clear the canvas.
   */
  cancel(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Stop animation, disconnect ResizeObserver, and remove the canvas from DOM.
   */
  dispose(): void {
    this.cancel();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }

  // ---------------------------------------------------------------------------
  // Core animation loop
  // ---------------------------------------------------------------------------

  /**
   * Drives a time-based animation. `drawFn` receives `progress` in [0, 1].
   * The canvas is cleared before each `drawFn` call. On completion the canvas
   * is cleared once more before `onComplete` fires.
   */
  private animate(
    durationMs: number,
    drawFn: (progress: number) => void,
    onComplete?: () => void,
  ): void {
    const start = performance.now();

    const loop = (now: number): void => {
      const progress = Math.min((now - start) / durationMs, 1);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      drawFn(progress);

      if (progress < 1) {
        this.animId = requestAnimationFrame(loop);
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.animId = 0;
        onComplete?.();
      }
    };

    this.animId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Effect 1 — Sonar Ping (~800ms)
  // ---------------------------------------------------------------------------
  // Green radial sweep: an arc rotates 360° from the canvas centre.
  // A trail of previous positions is drawn with decreasing alpha.

  private playSonarPing(onComplete?: () => void): void {
    const DURATION = 800;
    const COLOR = '#00ff41'; // CRT green
    const TRAIL_STEPS = 12; // ghost arcs behind the sweep line

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.sqrt(cx * cx + cy * cy); // covers full canvas

      const sweepAngle = progress * Math.PI * 2 - Math.PI / 2; // start from top

      // Draw trail arcs (most faded first)
      for (let i = TRAIL_STEPS; i >= 0; i--) {
        const trailAngle = sweepAngle - (i / TRAIL_STEPS) * (Math.PI / 2);
        const alpha = (1 - i / TRAIL_STEPS) * 0.35;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        // Draw a sector from trailAngle to sweepAngle
        this.ctx.arc(cx, cy, radius, trailAngle, sweepAngle);
        this.ctx.closePath();

        const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(0, 255, 65, 0)`);
        gradient.addColorStop(0.4, `rgba(0, 255, 65, ${alpha * 0.5})`);
        gradient.addColorStop(1, `rgba(0, 255, 65, ${alpha})`);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        this.ctx.restore();
      }

      // Draw the sweep line itself
      this.ctx.save();
      this.ctx.strokeStyle = COLOR;
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = COLOR;
      this.ctx.shadowBlur = 8;
      this.ctx.globalAlpha = 0.9;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(
        cx + radius * Math.cos(sweepAngle),
        cy + radius * Math.sin(sweepAngle),
      );
      this.ctx.stroke();
      this.ctx.restore();

      // Draw a thin arc at the sweep line's current angle for a "leading edge" glow
      this.ctx.save();
      this.ctx.strokeStyle = COLOR;
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowColor = COLOR;
      this.ctx.shadowBlur = 12;
      this.ctx.globalAlpha = 0.6;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius * 0.8, sweepAngle - 0.15, sweepAngle + 0.02);
      this.ctx.stroke();
      this.ctx.restore();
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 2 — Recon Drone (~600ms)
  // ---------------------------------------------------------------------------
  // Cyan horizontal scan line sweeps left → right with a fading wash behind it.

  private playReconDrone(onComplete?: () => void): void {
    const DURATION = 600;
    const COLOR = '#00ffff'; // cyan

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const easedProgress = easeOutQuad(progress);
      const x = easedProgress * width;

      // Fading wash from left edge to current scan position
      if (x > 0) {
        const washGradient = this.ctx.createLinearGradient(0, 0, x, 0);
        washGradient.addColorStop(0, 'rgba(0, 255, 255, 0.02)');
        washGradient.addColorStop(0.6, 'rgba(0, 255, 255, 0.06)');
        washGradient.addColorStop(1, 'rgba(0, 255, 255, 0.18)');
        this.ctx.fillStyle = washGradient;
        this.ctx.fillRect(0, 0, x, height);
      }

      // Horizontal scan line (2px) at current x
      this.ctx.save();
      this.ctx.fillStyle = COLOR;
      this.ctx.shadowColor = COLOR;
      this.ctx.shadowBlur = 14;
      this.ctx.globalAlpha = 0.95;
      this.ctx.fillRect(x - 1, 0, 2, height);
      this.ctx.restore();

      // Leading-edge glow bar (wider, lower alpha)
      this.ctx.save();
      const glowGradient = this.ctx.createLinearGradient(Math.max(0, x - 20), 0, x + 4, 0);
      glowGradient.addColorStop(0, 'rgba(0, 255, 255, 0)');
      glowGradient.addColorStop(1, 'rgba(0, 255, 255, 0.4)');
      this.ctx.fillStyle = glowGradient;
      this.ctx.fillRect(Math.max(0, x - 20), 0, 24, height);
      this.ctx.restore();
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 3 — Radar Jammer (~300ms)
  // ---------------------------------------------------------------------------
  // 3 rapid full-screen static noise flashes using ImageData.

  private playRadarJammer(onComplete?: () => void): void {
    const DURATION = 300;
    const FLASHES = 3;

    // Cross-effects
    getFlickerController()?.pulse(0.6, 300);
    AbilityOverlayManager.noiseInstance?.pulse(0.8, 300);

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const flashIndex = Math.floor(progress * FLASHES);
      // Alternate between bright flash and cleared canvas
      const isFlashOn = Math.floor(progress * FLASHES * 2) % 2 === 0;

      if (!isFlashOn) return; // canvas was cleared by animate(); nothing to draw

      // Fill with random grayscale noise
      const imageData = this.ctx.createImageData(width, height);
      const data = imageData.data;
      const flashBrightness = 1 - flashIndex * 0.2; // each flash slightly dimmer

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.floor(Math.random() * 256 * flashBrightness);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        data[i + 3] = Math.floor(180 + Math.random() * 75);
      }

      this.ctx.putImageData(imageData, 0, 0);
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 4 — Silent Running (~500ms)
  // ---------------------------------------------------------------------------
  // Radial gradient darkening — edges darken inward. Opacity 0 → 0.5 → 0.

  private playSilentRunning(onComplete?: () => void): void {
    const DURATION = 500;

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const cx = width / 2;
      const cy = height / 2;
      const innerRadius = Math.min(width, height) * 0.2;
      const outerRadius = Math.sqrt(cx * cx + cy * cy);

      // Opacity ramps up then back down (bell curve via easeInOutQuad on doubled progress)
      const bell = progress < 0.5
        ? easeInOutQuad(progress * 2)
        : easeInOutQuad((1 - progress) * 2);
      const alpha = bell * 0.5;

      const gradient = this.ctx.createRadialGradient(
        cx, cy, innerRadius,
        cx, cy, outerRadius,
      );
      gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
      gradient.addColorStop(0.5, `rgba(0, 0, 0, ${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 5 — Depth Charge (~600ms)
  // ---------------------------------------------------------------------------
  // 8 horizontal band flashes (red/orange) sequential top → bottom.

  private playDepthCharge(onComplete?: () => void): void {
    const DURATION = 600;
    const BANDS = 8;
    const COLORS = ['#ff0040', '#ff8c00']; // alternating red / orange

    // Cross-effect
    getFlickerController()?.pulse(0.7, 600);

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const bandHeight = height / BANDS;

      for (let i = 0; i < BANDS; i++) {
        // Each band has a staggered start time across [0, 0.85] of total progress
        const bandStart = (i / BANDS) * 0.85;
        const bandEnd = bandStart + 0.25;
        const bandProgress = (progress - bandStart) / (bandEnd - bandStart);

        if (bandProgress <= 0 || bandProgress > 1) continue;

        // Flash intensity: quick rise then fade
        const flashAlpha = bandProgress < 0.3
          ? easeOutQuad(bandProgress / 0.3)
          : easeOutQuad(1 - (bandProgress - 0.3) / 0.7);

        const color = COLORS[i % COLORS.length] ?? '#ff0040';
        const y = i * bandHeight;

        this.ctx.save();
        this.ctx.globalAlpha = flashAlpha * 0.75;
        this.ctx.fillStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 20;
        this.ctx.fillRect(0, y, width, bandHeight);
        this.ctx.restore();
      }
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 6 — G-SONAR (~1000ms)
  // ---------------------------------------------------------------------------
  // Expanding ring (annulus) from centre to viewport edge.

  private playGSonar(onComplete?: () => void): void {
    const DURATION = 1000;
    const COLOR = '#00ff41'; // green glow
    const RING_THICKNESS = 18;

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.sqrt(cx * cx + cy * cy) + RING_THICKNESS;

      const easedProgress = easeOutQuad(progress);
      const outerRadius = easedProgress * maxRadius;
      const innerRadius = Math.max(0, outerRadius - RING_THICKNESS);

      // Alpha fades as the ring expands outward
      const alpha = (1 - easedProgress) * 0.85;

      if (outerRadius <= 0) return;

      // Outer glow halo
      this.ctx.save();
      this.ctx.shadowColor = COLOR;
      this.ctx.shadowBlur = 24;
      this.ctx.strokeStyle = COLOR;
      this.ctx.lineWidth = RING_THICKNESS;
      this.ctx.globalAlpha = alpha * 0.5;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (outerRadius + innerRadius) / 2, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();

      // Crisp inner ring via clipping annulus
      this.ctx.save();
      // Clip to the annulus
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      if (innerRadius > 0) {
        // Subtract inner circle using evenodd fill rule
        this.ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
      }
      this.ctx.clip('evenodd');

      const gradient = this.ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
      gradient.addColorStop(0, `rgba(0, 255, 65, ${alpha * 0.4})`);
      gradient.addColorStop(0.5, `rgba(0, 255, 65, ${alpha})`);
      gradient.addColorStop(1, `rgba(0, 255, 65, ${alpha * 0.2})`);
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.restore();
    }, onComplete);
  }

  // ---------------------------------------------------------------------------
  // Effect 7 — Acoustic Cloak (~700ms)
  // ---------------------------------------------------------------------------
  // Screen dims + ~30 small green dots accelerating inward from edges toward
  // the centre.

  private playAcousticCloak(onComplete?: () => void): void {
    const DURATION = 700;
    const DOT_COUNT = 30;
    const DOT_COLOR = '#00ff41';

    // Cross-effects
    getFlickerController()?.pulse(0.5, 700);
    AbilityOverlayManager.noiseInstance?.pulse(0.5, 700);

    // Generate dots once at deterministic-ish positions along the edges
    interface Dot {
      // Normalised start position (0–1 range, mapped to canvas coords)
      sx: number;
      sy: number;
      // Random radius 2–5
      radius: number;
      // Acceleration multiplier (varies dot speed slightly)
      speed: number;
    }

    const dots: Dot[] = [];
    for (let i = 0; i < DOT_COUNT; i++) {
      const side = i % 4; // 0=top, 1=right, 2=bottom, 3=left
      let sx: number;
      let sy: number;

      switch (side) {
        case 0: sx = Math.random(); sy = 0; break;
        case 1: sx = 1; sy = Math.random(); break;
        case 2: sx = Math.random(); sy = 1; break;
        default: sx = 0; sy = Math.random(); break;
      }

      dots.push({
        sx,
        sy,
        radius: 2 + Math.random() * 3,
        speed: 0.6 + Math.random() * 0.8,
      });
    }

    this.animate(DURATION, (progress) => {
      const { width, height } = this.canvas;
      const cx = width / 2;
      const cy = height / 2;

      // Dim overlay: opacity ramps up then down
      const bell = progress < 0.5
        ? easeInOutQuad(progress * 2)
        : easeInOutQuad((1 - progress) * 2);
      const dimAlpha = bell * 0.55;

      this.ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha})`;
      this.ctx.fillRect(0, 0, width, height);

      // Draw dots moving from edges toward centre (accelerating via easeInQuad)
      const easeIn = (t: number): number => t * t;

      for (const dot of dots) {
        // Each dot uses its own speed factor
        const t = Math.min(easeIn(progress * dot.speed), 1);

        const startX = dot.sx * width;
        const startY = dot.sy * height;
        const x = startX + (cx - startX) * t;
        const y = startY + (cy - startY) * t;

        // Fade out as dots converge on centre
        const dotAlpha = (1 - t) * 0.9 + 0.1;

        this.ctx.save();
        this.ctx.globalAlpha = dotAlpha;
        this.ctx.fillStyle = DOT_COLOR;
        this.ctx.shadowColor = DOT_COLOR;
        this.ctx.shadowBlur = 6;
        this.ctx.beginPath();
        this.ctx.arc(x, y, dot.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    }, onComplete);
  }
}

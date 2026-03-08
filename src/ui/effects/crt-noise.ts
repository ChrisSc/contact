/**
 * CRTNoise — canvas-based animated film grain overlay.
 *
 * A 256×256 canvas is filled with random grayscale ImageData every 3 RAF
 * frames (~20 fps). The canvas is tiled across a full-screen wrapper div via
 * CSS background-size. The wrapper sits at z-index 999 (below the CRT
 * scanline overlay at 1000), pointer-events none, opacity 0.04 at rest.
 *
 * pulse(intensity, durationMs) boosts opacity temporarily — used during
 * radar jammer / acoustic cloak activations.
 */
export class CRTNoise {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrapper: HTMLDivElement;
  private rafId: number = 0;
  private running: boolean = false;
  private frameCount: number = 0;

  // Opacity state
  private baseOpacity: number = 0.04;
  private pulseUntil: number = 0;
  private pulseOpacity: number = 0.04;

  constructor() {
    // 256×256 grain tile
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CRTNoise: cannot get 2d context');
    }
    this.ctx = ctx;

    // Full-screen wrapper that tiles the canvas via CSS
    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      `opacity: ${this.baseOpacity}`,
      'pointer-events: none',
      'z-index: 999',
      'background-repeat: repeat',
      'background-size: 256px 256px',
    ].join('; ');
  }

  /**
   * render() returns the wrapper div that tiles the noise canvas.
   * Append it to #app (or any full-screen container) once.
   */
  render(): HTMLDivElement {
    return this.wrapper;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frameCount = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /**
   * Temporarily boost noise opacity.
   * @param intensity — 0.0–1.0, where 1.0 → opacity 0.15
   * @param durationMs — how long the pulse lasts in milliseconds
   */
  pulse(intensity: number, durationMs: number): void {
    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    // Scale from baseOpacity up to 0.15 at full intensity
    this.pulseOpacity = this.baseOpacity + clampedIntensity * (0.15 - this.baseOpacity);
    this.pulseUntil = performance.now() + durationMs;
  }

  dispose(): void {
    this.stop();
    if (this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  private tick(): void {
    if (!this.running) return;

    // Update grain every 3 frames (~20 fps at 60 fps display)
    if (this.frameCount % 3 === 0) {
      this.drawNoise();
      this.updateOpacity();
    }

    this.frameCount++;
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private drawNoise(): void {
    const { width, height } = this.canvas;
    const imageData = this.ctx.createImageData(width, height);
    const data = imageData.data;

    // Fill with random grayscale pixels — each pixel RGBA where R=G=B=random gray
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(Math.random() * 256);
      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
      data[i + 3] = 255;  // A (fully opaque — wrapper opacity controls visibility)
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Update wrapper background to reference the freshly drawn canvas
    this.wrapper.style.backgroundImage = `url(${this.canvas.toDataURL()})`;
  }

  private updateOpacity(): void {
    const now = performance.now();
    const opacity = now < this.pulseUntil ? this.pulseOpacity : this.baseOpacity;
    this.wrapper.style.opacity = String(opacity);
  }
}

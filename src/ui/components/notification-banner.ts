export interface NotificationConfig {
  text: string;
  duration?: number;      // ms, default 2500
  className?: string;     // CSS modifier class
}

export class NotificationBanner {
  private el: HTMLElement;
  private queue: NotificationConfig[] = [];
  private isShowing = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'notification-banner';
  }

  render(): HTMLElement {
    return this.el;
  }

  show(config: NotificationConfig): void {
    if (this.isShowing) {
      this.queue.push(config);
      return;
    }
    this.displayNotification(config);
  }

  private displayNotification(config: NotificationConfig): void {
    this.isShowing = true;
    const duration = config.duration ?? 2500;

    const msg = document.createElement('div');
    msg.className = 'notification-banner__message';
    if (config.className) msg.classList.add(config.className);
    msg.textContent = config.text;

    this.el.appendChild(msg);

    // Auto-dismiss after duration
    setTimeout(() => {
      msg.classList.add('notification-banner__message--dismiss');
      setTimeout(() => {
        msg.remove();
        this.isShowing = false;
        // Show next in queue
        if (this.queue.length > 0) {
          this.displayNotification(this.queue.shift()!);
        }
      }, 400); // fade out time
    }, duration);
  }

  destroy(): void {
    this.queue = [];
    this.isShowing = false;
    this.el.innerHTML = '';
    this.el.remove();
  }
}

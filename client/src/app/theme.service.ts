import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ColorMode = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly mode = signal<ColorMode>(this.readMode());

  constructor() { this.apply(this.mode()); }

  setMode(mode: ColorMode): void {
    this.mode.set(mode);
    this.apply(mode);
    if (this.browser) localStorage.setItem('mweboard-color-mode', mode);
  }

  private readMode(): ColorMode {
    if (!this.browser) return 'dark';
    return localStorage.getItem('mweboard-color-mode') === 'light' ? 'light' : 'dark';
  }

  private apply(mode: ColorMode): void {
    this.document.documentElement.classList.toggle('theme-light', mode === 'light');
    this.document.documentElement.style.colorScheme = mode;
  }
}

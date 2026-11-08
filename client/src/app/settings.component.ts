import { Component } from '@angular/core';
@Component({
  standalone: true,
  template: `
    <main class="page">
      <p class="eyebrow">WORKSPACE</p><h1>Settings</h1>
      <p class="intro">Workspace settings will appear here.</p>
    </main>
  `,
  styles: [`:host{display:block;color:var(--text)}.page{max-width:960px;margin:0 auto}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.intro{color:var(--muted);margin:8px 0 24px;font-size:12px}`],
})
export class SettingsComponent {}

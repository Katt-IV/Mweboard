import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-error-message',
  standalone: true,
  template: `<aside class="error-box" role="alert"><strong>Error: {{ code }}</strong><span>{{ message }}</span></aside>`,
  styles: [`.error-box{display:flex;align-items:flex-start;gap:10px;margin:12px 0 0;padding:12px 14px;border:1px solid color-mix(in srgb,var(--danger) 40%,transparent);border-radius:10px;background:color-mix(in srgb,var(--danger) 10%,var(--surface));color:var(--text);font-size:12px;line-height:1.5}.error-box strong{color:var(--danger);white-space:nowrap}.error-box span{color:var(--text-secondary)}`],
})
export class ErrorMessageComponent {
  @Input({ required: true }) code!: number;
  @Input({ required: true }) message!: string;
}

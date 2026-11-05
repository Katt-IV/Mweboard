import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  template: `
    <main class="page">
      <p class="eyebrow">WORKSPACE</p><h1>Settings</h1>
      <p class="intro">Send a test WhatsApp message to a phone number.</p>
      <section class="card">
        <form [formGroup]="form" (ngSubmit)="send()" novalidate>
          <mat-form-field appearance="fill" class="phone-field">
            <mat-label>Phone number (E.164)</mat-label>
            <input matInput type="tel" formControlName="to" placeholder="+9627XXXXXXXX" autocomplete="tel">
            @if (form.controls.to.hasError('required')) { <mat-error>Phone number is required.</mat-error> }
            @if (form.controls.to.hasError('pattern')) { <mat-error>Enter a valid E.164 number, for example +9627XXXXXXXX.</mat-error> }
          </mat-form-field>
          <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || loading()">
            {{ loading() ? 'Sending…' : 'Send test message' }}
          </button>
        </form>
        @if (loading()) { <p class="loading" role="status">Sending test message…</p> }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--text)}.page{max-width:960px;margin:0 auto}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.intro{color:var(--muted);margin:8px 0 24px;font-size:12px}.card{max-width:560px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 24px #00000012}form{display:grid;gap:12px}.phone-field{width:100%}.loading{color:var(--muted);margin:14px 0 0}.error{color:var(--danger);margin:14px 0 0}@media(max-width:650px){.card{padding:18px}}
  `],
})
export class SettingsComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    to: ['', [Validators.required, Validators.pattern(/^\+[1-9]\d{7,14}$/)]],
  });

  async send() {
    if (this.form.invalid || this.loading()) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ wamid?: string; messageId?: string }>(
        `${environment.apiBaseUrl}/api/test-message`,
        { to: this.form.controls.to.value.trim() },
      ));
      const messageId = result.wamid ?? result.messageId ?? 'unknown';
      this.snackBar.open(`Test message sent. Message ID: ${messageId}`, 'Close', { duration: 7000 });
    } catch (error) {
      this.error.set(this.readableError(error));
    } finally { this.loading.set(false); }
  }

  private readableError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const response = error.error as { error?: unknown } | null;
      if (typeof response?.error === 'string' && response.error.trim()) return response.error;
      if (error.status === 0) return 'Could not reach the API. Check that the server is running and try again.';
      return `The request failed (${error.status}). Please try again.`;
    }
    return 'Could not send the test message. Please try again.';
  }
}

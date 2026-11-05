import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatMenuModule, MatSnackBarModule],
  template: `
    <header class="navbar">
      <nav aria-label="Main navigation">
        <a routerLink="/dashboard" class="brand">Dashboard</a>
        <a routerLink="/subscribers" routerLinkActive="active" class="nav-link">Subscribers</a>
        <a routerLink="/settings" routerLinkActive="active" class="nav-link">Settings</a>
      </nav>
      <button mat-button [matMenuTriggerFor]="accountMenu">Account</button>
      <mat-menu #accountMenu="matMenu"><button mat-menu-item (click)="logout()">Log out</button></mat-menu>
    </header>
    <main class="page">
      <h1>Settings</h1>
      <p class="intro">Send a test WhatsApp message to a phone number.</p>
      <section class="card">
        <form [formGroup]="form" (ngSubmit)="send()" novalidate>
          <mat-form-field appearance="outline" class="phone-field">
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
    :host { display:block; min-height:100vh; background:#f7f8fa; color:#202124; font-family:Arial,sans-serif; }
    .navbar { height:64px; display:flex; align-items:center; justify-content:space-between; padding:0 32px; background:white; border-bottom:1px solid #e5e7eb; }
    nav { display:flex; align-items:center; gap:24px; } a { color:inherit; text-decoration:none; } .brand { font-weight:700; } .nav-link { color:#667085; } .nav-link.active { color:#3f51b5; font-weight:600; }
    .page { max-width:960px; margin:42px auto; padding:0 24px; } h1 { margin:0; font-size:28px; } .intro { color:#667085; margin:8px 0 24px; }
    .card { max-width:540px; padding:24px; background:white; border:1px solid #e5e7eb; border-radius:10px; } form { display:grid; gap:12px; }
    .phone-field { width:100%; } .loading { color:#475467; margin:14px 0 0; } .error { color:#b42318; margin:14px 0 0; }
    @media(max-width:650px) { .navbar { padding:0 16px; } nav { gap:14px; } .page { margin:26px auto; padding:0 14px; } .card { padding:18px; } }
  `],
})
export class SettingsComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
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

  async logout() { await this.auth.signOut(); await this.router.navigate(['/login']); }

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

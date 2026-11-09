import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from './auth.service';
import { ErrorMessageComponent } from './error-message.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, ErrorMessageComponent],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{{ isSignUp() ? 'Create your account' : 'Welcome back' }}</h1>
        <p>Sign in to continue to your dashboard.</p>
        <button mat-stroked-button type="button" class="google-button" (click)="google()" [disabled]="busy()">Continue with Google</button>
        <div class="divider"><span>or continue with email</span></div>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" formControlName="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <p class="field-error">Enter a valid email address.</p>
          }
          <label for="password">Password</label>
          <input id="password" type="password" [autocomplete]="isSignUp() ? 'new-password' : 'current-password'" formControlName="password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <p class="field-error">Password must be at least 6 characters.</p>
          }
          @if (error()) { <app-error-message [code]="errorCode()" [message]="error()" /> }
          <button mat-flat-button color="primary" class="submit-button" type="submit" [disabled]="form.invalid || busy()">
            {{ isSignUp() ? 'Create account' : 'Sign in' }}
          </button>
        </form>
        @if (!isSignUp()) { <button class="forgot-button" type="button" [disabled]="busy()" (click)="openResetWindow()">Forgot password?</button> }
        <button class="mode-button" type="button" (click)="toggleMode()">
          {{ isSignUp() ? 'Already have an account? Sign in' : 'New here? Create an account' }}
        </button>
      </section>
    </main>
    @if (resetWindowOpen()) {
      <div class="dialog-backdrop" (click)="closeResetWindow()">
        <section class="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title" (click)="$event.stopPropagation()">
          <header class="dialog-heading"><div><p class="dialog-kicker">ACCOUNT RECOVERY</p><h2 id="reset-title">Reset your password</h2></div><button type="button" class="close-dialog" aria-label="Close" [disabled]="busy()" (click)="closeResetWindow()">×</button></header>
          <p class="dialog-copy">Enter your account email and we’ll send you a password reset link.</p>
          <label for="reset-email">Email address</label>
          <input id="reset-email" type="email" autocomplete="email" [value]="resetEmail()" (input)="resetEmail.set($any($event.target).value)">
          @if (resetError()) { <app-error-message [code]="4002" [message]="resetError()" /> }
          @if (resetMessage()) { <p class="reset-message" role="status">{{ resetMessage() }}</p> }
          <div class="dialog-actions"><button class="cancel-button" type="button" [disabled]="busy()" (click)="closeResetWindow()">Close</button><button class="send-button" type="button" [disabled]="busy()" (click)="resetPassword()">{{ busy() ? 'Sending…' : 'Send reset link' }}</button></div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:var(--text); font-family:Arial,sans-serif; }
    .auth-page { min-height:100vh; display:grid; place-items:center; padding:24px; background:var(--page); }
    .auth-card { width:min(100%,400px); padding:32px; background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:0 12px 32px #0002; }
    h1 { margin:0; font-size:25px; } .auth-card>p { margin:9px 0 24px; color:var(--muted); }
    .google-button,.submit-button { width:100%; height:44px; } .divider { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:13px; margin:22px 0; }
    .divider::before,.divider::after { content:''; height:1px; background:#e5e7eb; flex:1; }
    form { display:grid; gap:8px; } label { margin-top:8px; font-size:14px; font-weight:600; }
    input { box-sizing:border-box; width:100%; height:42px; padding:0 12px; border:1px solid var(--border); border-radius:6px; font:inherit; background:var(--elevated); color:var(--text); }
    .field-error,.error { margin:0; color:var(--danger); font-size:13px; } .submit-button { margin-top:12px; }
    .forgot-button,.mode-button { display:block; border:0; background:none; color:var(--accent); cursor:pointer; }
    .forgot-button { margin:14px auto 0; font-size:12px; }
    .mode-button { margin:18px auto 0; }
    .forgot-button:disabled { opacity:.55; cursor:wait; }
    .reset-message { margin:14px 0 0; color:var(--success); font-size:12px; text-align:center; }
    .dialog-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:#0009; }
    .reset-dialog { width:min(100%,430px); display:grid; gap:12px; padding:24px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:16px; box-shadow:0 24px 70px #0008; }
    .dialog-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .dialog-kicker { margin:0 0 6px; color:var(--muted); font-size:9px; font-weight:700; letter-spacing:1.2px; }
    .dialog-heading h2 { margin:0; font-size:19px; }
    .dialog-copy { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
    .reset-dialog label { margin:2px 0 -6px; font-size:12px; font-weight:600; }
    .reset-dialog input { border-radius:9px; }
    .close-dialog { width:32px; height:32px; border:0; border-radius:8px; background:var(--elevated); color:var(--text); font-size:22px; cursor:pointer; }
    .dialog-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:4px; }
    .cancel-button,.send-button { min-height:38px; padding:0 13px; border:1px solid var(--border); border-radius:9px; background:var(--elevated); color:var(--text); cursor:pointer; }
    .send-button { border-color:var(--accent); background:var(--accent); color:#fff; }
    .cancel-button:disabled,.send-button:disabled,.close-dialog:disabled { opacity:.55; cursor:wait; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly isSignUp = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorCode = signal(4001);
  readonly resetWindowOpen = signal(false);
  readonly resetEmail = signal('');
  readonly resetMessage = signal('');
  readonly resetError = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  toggleMode() { this.isSignUp.update(value => !value); this.error.set(''); this.resetMessage.set(''); }

  openResetWindow(): void {
    this.resetEmail.set(this.form.controls.email.value.trim());
    this.resetMessage.set('');
    this.resetError.set('');
    this.resetWindowOpen.set(true);
  }

  closeResetWindow(): void {
    if (this.busy()) return;
    this.resetWindowOpen.set(false);
  }

  async resetPassword() {
    const email = this.resetEmail().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || this.busy()) {
      this.resetError.set('Enter a valid email address.');
      return;
    }
    this.busy.set(true);
    this.resetError.set('');
    this.resetMessage.set('');
    try {
      await this.auth.sendPasswordReset(email);
      this.resetMessage.set('If an account uses this email, reset instructions have been sent. Check your inbox and spam folder.');
    } catch (error) {
      this.resetError.set(this.messageFor(error));
    } finally { this.busy.set(false); }
  }

  async submit() {
    if (this.form.invalid || this.busy()) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.error.set('');
    this.errorCode.set(4001);
    const { email, password } = this.form.getRawValue();
    try {
      if (this.isSignUp()) await this.auth.signUpWithEmail(email, password);
      else await this.auth.signInWithEmail(email, password);
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.errorCode.set(4001);
      this.error.set(this.messageFor(error));
    } finally { this.busy.set(false); }
  }

  async google() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.errorCode.set(4001);
    try {
      await this.auth.signInWithGoogle();
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally { this.busy.set(false); }
  }

  private messageFor(error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Email or password is incorrect.';
    if (code.includes('email-already-in-use')) return 'An account already exists for this email.';
    if (code.includes('invalid-email')) return 'Enter a valid email address.';
    if (code.includes('weak-password')) return 'Choose a stronger password with at least 6 characters.';
    if (code.includes('popup-closed-by-user')) return 'Google sign-in was cancelled.';
    if (code.includes('popup-blocked')) return 'Allow pop-ups in your browser to continue with Google.';
    if (code.includes('operation-not-allowed')) return 'This sign-in method is not enabled. Contact your administrator.';
    if (code.includes('network-request-failed')) return 'Check your internet connection and try again.';
    return 'Authentication failed. Please try again.';
  }
}

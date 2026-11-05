import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule],
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
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button mat-flat-button color="primary" class="submit-button" type="submit" [disabled]="form.invalid || busy()">
            {{ isSignUp() ? 'Create account' : 'Sign in' }}
          </button>
        </form>
        <button class="mode-button" type="button" (click)="toggleMode()">
          {{ isSignUp() ? 'Already have an account? Sign in' : 'New here? Create an account' }}
        </button>
      </section>
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:#202124; font-family:Arial,sans-serif; }
    .auth-page { min-height:100vh; display:grid; place-items:center; padding:24px; background:#f5f6fa; }
    .auth-card { width:min(100%,400px); padding:32px; background:white; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 12px 32px #17203312; }
    h1 { margin:0; font-size:25px; } .auth-card>p { margin:9px 0 24px; color:#667085; }
    .google-button,.submit-button { width:100%; height:44px; } .divider { display:flex; align-items:center; gap:12px; color:#667085; font-size:13px; margin:22px 0; }
    .divider::before,.divider::after { content:''; height:1px; background:#e5e7eb; flex:1; }
    form { display:grid; gap:8px; } label { margin-top:8px; font-size:14px; font-weight:600; }
    input { box-sizing:border-box; width:100%; height:42px; padding:0 12px; border:1px solid #d0d5dd; border-radius:6px; font:inherit; }
    .field-error,.error { margin:0; color:#b42318; font-size:13px; } .submit-button { margin-top:12px; }
    .mode-button { display:block; border:0; background:none; color:#3f51b5; margin:18px auto 0; cursor:pointer; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly isSignUp = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  toggleMode() { this.isSignUp.update(value => !value); this.error.set(''); }

  async submit() {
    if (this.form.invalid || this.busy()) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    try {
      if (this.isSignUp()) await this.auth.signUpWithEmail(email, password);
      else await this.auth.signInWithEmail(email, password);
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally { this.busy.set(false); }
  }

  async google() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
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

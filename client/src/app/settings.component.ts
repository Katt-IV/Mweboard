import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ColorMode, ThemeService } from './theme.service';
import { environment } from '../environments/environment';
import { ErrorMessageComponent } from './error-message.component';

@Component({
  standalone: true,
  imports: [ErrorMessageComponent],
  template: `
    <main class="page">
      <p class="eyebrow">WORKSPACE</p><h1>Settings</h1>
      <p class="intro">Manage your account and appearance preferences.</p>
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="openSection() === 'account'" aria-controls="account-panel" (click)="toggleSection('account')">
          <span class="section-icon mi">account_circle</span><span class="trigger-copy"><strong>Account</strong><small>Your signed-in account and security</small></span><span class="chevron mi">{{ openSection() === 'account' ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (openSection() === 'account') {
          <div class="accordion-panel" id="account-panel"><section class="card">
            <div class="account-details"><span class="detail-label">Email</span><strong>{{ auth.user()?.email || 'Signed in with Google' }}</strong></div>
            <h3>Change password</h3>
            @if (hasPasswordProvider()) {
              <button class="secondary" type="button" (click)="openPasswordWindow()">Change password</button>
            } @else { <p class="help">This account uses Google sign-in. Its password is managed by Google.</p><a class="secondary google-password" href="https://myaccount.google.com/signinoptions/password" target="_blank" rel="noopener noreferrer">Change Google password</a> }
            <hr>
            <h3 class="danger-title">Delete account</h3>
            <p class="help">This permanently deletes your account, campaigns, messages, subscribers, settings, and campaign statistics.</p>
            @if (hasPasswordProvider()) {
              <label class="delete-password">Current password<input type="password" autocomplete="current-password" [value]="deletePassword()" (input)="deletePassword.set($any($event.target).value)"></label>
            }
            <label class="delete-confirm">Type DELETE to confirm<input type="text" autocomplete="off" [value]="deleteConfirmation()" (input)="deleteConfirmation.set($any($event.target).value)"></label>
            <button class="danger-button" type="button" [disabled]="busy() || deleteConfirmation() !== 'DELETE' || (hasPasswordProvider() && !deletePassword())" (click)="deleteAccount()">{{ busy() ? 'Deleting…' : 'Delete account' }}</button>
            @if (error()) { <app-error-message [code]="errorCode()" [message]="error()" /> }
            @if (message()) { <p class="success" role="status">{{ message() }}</p> }
            <button class="secondary logout" type="button" [disabled]="busy()" (click)="logout()"><span class="mi">logout</span>Log out</button>
          </section></div>
        }
      </section>
      @if (passwordWindowOpen()) {
        <div class="dialog-backdrop" (click)="closePasswordWindow()">
          <section class="password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title" (click)="$event.stopPropagation()">
            <div class="dialog-heading"><div><p class="eyebrow">ACCOUNT SECURITY</p><h2 id="password-dialog-title">Change password</h2></div><button type="button" class="close-dialog" aria-label="Close" (click)="closePasswordWindow()">×</button></div>
            <label>Current password<input type="password" autocomplete="current-password" [value]="currentPassword()" (input)="currentPassword.set($any($event.target).value)"></label>
            <label>New password<input type="password" autocomplete="new-password" [value]="newPassword()" (input)="newPassword.set($any($event.target).value)"></label>
            <label>Confirm new password<input type="password" autocomplete="new-password" [value]="confirmPassword()" (input)="confirmPassword.set($any($event.target).value)"></label>
            <p class="help">Use at least 6 characters.</p>
            @if (passwordError()) { <app-error-message [code]="passwordErrorCode()" [message]="passwordError()" /> }
            @if (passwordMessage()) { <p class="success" role="status">{{ passwordMessage() }}</p> }
            <div class="dialog-actions"><button class="secondary" type="button" (click)="closePasswordWindow()">Close</button><button class="primary" type="button" [disabled]="busy() || !canChangePassword()" (click)="changePassword()">{{ busy() ? 'Please wait…' : 'Save password' }}</button></div>
          </section>
        </div>
      }
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="openSection() === 'appearance'" aria-controls="appearance-panel" (click)="toggleSection('appearance')">
          <span class="section-icon mi">contrast</span><span class="trigger-copy"><strong>Appearance</strong><small>Choose a color mode for this device</small></span><span class="chevron mi">{{ openSection() === 'appearance' ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (openSection() === 'appearance') {
          <div class="accordion-panel" id="appearance-panel"><section class="card">
            <div class="appearance-setting"><div><strong>Color mode</strong><small>Choose light or dark colors for this device</small></div><div class="mode-switch" role="group" aria-label="Color mode">
              <button type="button" [class.selected]="theme.mode() === 'light'" [attr.aria-pressed]="theme.mode() === 'light'" (click)="setMode('light')"><span class="mi">light_mode</span><span>Light</span></button>
              <button type="button" [class.selected]="theme.mode() === 'dark'" [attr.aria-pressed]="theme.mode() === 'dark'" (click)="setMode('dark')"><span class="mi">dark_mode</span><span>Dark</span></button>
            </div>
            </div>
            <div class="fullscreen-setting"><div><strong>Fullscreen</strong><small>Use the entire screen for Mweboard</small></div><button class="switch" type="button" role="switch" [attr.aria-checked]="fullscreen()" (click)="toggleFullscreen()"><span></span><span class="state-label">{{ fullscreen() ? 'On' : 'Off' }}</span></button></div>
            @if (fullscreenError()) { <app-error-message [code]="7001" [message]="fullscreenError()" /> }
          </section></div>
        }
      </section>
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="openSection() === 'help'" aria-controls="help-panel" (click)="toggleSection('help')">
          <span class="section-icon mi">help</span><span class="trigger-copy"><strong>Help</strong><small>Learn what Mweboard can do</small></span><span class="chevron mi">{{ openSection() === 'help' ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (openSection() === 'help') { <div class="accordion-panel" id="help-panel"><section class="card help-card"><p>Get an overview of the dashboard, campaigns, subscribers, message log, and account settings.</p><button class="primary" type="button" (click)="helpWindowOpen.set(true)">Open app guide</button></section></div> }
      </section>
      @if (helpWindowOpen()) {
        <div class="dialog-backdrop" (click)="helpWindowOpen.set(false)">
          <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" (click)="$event.stopPropagation()">
            <div class="dialog-heading"><div><p class="eyebrow">MWEBBOARD GUIDE</p><h2 id="help-title">How to use the app</h2></div><button type="button" class="close-dialog" aria-label="Close help" (click)="helpWindowOpen.set(false)">×</button></div>
            <div class="help-content">
              <section><h3>Dashboard</h3><p>See subscriber and campaign totals, message delivery, recent campaigns, and the daily message statistics chart. Use the calendar to review scheduled sends or start a campaign for a future day.</p></section>
              <section><h3>Subscribers</h3><p>Add, edit, search, import, and remove contacts. Keep WhatsApp opt-in consent accurate; campaigns are sent only to opted-in contacts.</p></section>
              <section><h3>Campaigns</h3><p>Create a text, image, or approved-template campaign. Send it now or choose a future date and time. Scheduled campaigns can be reviewed, rescheduled, or cancelled. Campaign history includes delivery details and search.</p></section>
              <section><h3>Message log</h3><p>Review message delivery statuses and errors recorded for your campaigns.</p></section>
              <section><h3>Settings</h3><p>Change your account password, delete your account, choose light or dark mode, and switch the browser to fullscreen. Google account passwords are managed by Google.</p></section>
              <p class="help-footnote">Mweboard connects to Firebase for sign-in and data storage and to the WhatsApp Cloud API for message delivery. Your workspace data belongs to the signed-in account.</p>
            </div>
            <div class="dialog-actions"><button class="secondary" type="button" (click)="helpWindowOpen.set(false)">Close guide</button></div>
          </section>
        </div>
      }
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--text)}.page{max-width:960px;margin:0 auto}.mi{font-family:'Material Symbols Rounded';font-size:20px;line-height:1}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.intro{color:var(--muted);margin:8px 0 24px;font-size:12px}.accordion{margin:0 0 11px;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}.accordion-trigger{width:100%;min-height:76px;border:0;padding:14px 18px;background:var(--surface);color:var(--text);display:flex;align-items:center;gap:14px;text-align:left;cursor:pointer}.accordion-trigger:hover{background:var(--elevated)}.section-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--elevated);color:var(--accent);font-size:22px;flex:none}.trigger-copy{display:grid;gap:5px;flex:1}.trigger-copy strong{font-size:14px}.trigger-copy small{font-size:11px;color:var(--muted)}.chevron{font-size:20px;color:var(--muted)}.accordion-panel{padding:14px;border-top:1px solid var(--border)}.card{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px #00000012}.account-details{display:grid;gap:6px;padding:0 0 20px}.detail-label{font-size:11px;color:var(--muted)}.account-details strong{font-size:13px;font-weight:500}h3{font-size:13px;margin:8px 0 12px}.delete-password,.delete-confirm{display:grid;gap:6px;max-width:420px;margin:12px 0;font-size:11px;color:var(--muted)}input{width:100%;height:40px;padding:0 11px;border:1px solid var(--border);border-radius:8px;background:var(--elevated);color:var(--text)}.secondary,.mode-switch button,.danger-button,.primary{border:1px solid var(--border);border-radius:9px;padding:10px 13px;background:var(--elevated);color:var(--text);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.secondary:hover,.mode-switch button:hover{border-color:var(--accent)}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.google-password{text-decoration:none;font-size:12px}.google-password:hover{border-color:var(--accent)}button:disabled{opacity:.5;cursor:not-allowed}.help{font-size:11px;line-height:1.5;color:var(--muted);margin:0 0 12px}hr{border:0;border-top:1px solid var(--border);margin:20px 0}.danger-title{color:var(--danger)}.danger-button{margin-top:4px;border-color:var(--danger);background:var(--danger);color:#fff}.danger-button:hover{filter:brightness(1.08)}.logout{display:flex;margin-top:20px}.error,.success{font-size:12px;margin:12px 0 0}.success{color:var(--success)}.appearance-setting,.fullscreen-setting{display:flex;align-items:center;justify-content:space-between;gap:18px}.appearance-setting{padding:0 0 18px}.appearance-setting>div:first-child,.fullscreen-setting>div{display:grid;gap:5px}.appearance-setting strong,.fullscreen-setting strong{font-size:13px}.appearance-setting small,.fullscreen-setting small{font-size:11px;color:var(--muted)}.mode-switch{display:flex;flex:none;width:max-content;gap:3px;padding:4px;border:1px solid var(--border);border-radius:999px;background:var(--elevated)}.mode-switch button{min-width:84px;border:0;border-radius:999px;padding:8px 12px;background:transparent;gap:7px;font-size:11px}.mode-switch button.selected{background:var(--accent);color:#fff;box-shadow:0 2px 8px #0002}.fullscreen-setting{margin-top:0;padding-top:18px;border-top:1px solid var(--border)}.switch{position:relative;width:76px;height:34px;flex:none;display:flex;align-items:center;justify-content:center;padding:0 8px;border:1px solid var(--border);border-radius:999px;background:var(--elevated);color:var(--text);cursor:pointer;font-size:11px}.switch>span:first-child{position:absolute;left:4px;width:24px;height:24px;border-radius:50%;background:var(--muted);transition:left 200ms cubic-bezier(.2,.8,.2,1),background-color 180ms ease}.switch .state-label{position:absolute;top:50%;z-index:1;margin:0;transform:translateY(-50%);font-size:10px}.switch:not([aria-checked=true]) .state-label{left:38px}.switch[aria-checked=true] .state-label{left:10px}.switch[aria-checked=true]{border-color:var(--accent);background:var(--accent);color:white}.switch[aria-checked=true]>span:first-child{left:calc(100% - 28px);background:white}.dialog-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#0009}.password-dialog{width:min(100%,440px);padding:22px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 70px #0008;display:grid;gap:12px}.dialog-heading{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}.dialog-heading h2{font-size:19px;margin:0}.dialog-heading .eyebrow{font-size:9px}.password-dialog>label{display:grid;gap:6px;color:var(--muted);font-size:11px}.close-dialog{width:32px;height:32px;border:0;border-radius:8px;background:var(--elevated);color:var(--text);font-size:22px;cursor:pointer}.dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:4px}@media(max-width:650px){.password-dialog{padding:18px}.accordion-trigger{padding:12px;gap:10px}.accordion-panel{padding:9px}.card{padding:14px}.appearance-setting,.fullscreen-setting{align-items:flex-start;flex-direction:column}.mode-switch{align-self:flex-end}}
  `, `
    .help-card{display:flex;align-items:center;justify-content:space-between;gap:18px}.help-card p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.help-dialog{width:min(100%,560px);max-height:min(82vh,720px);overflow:auto;padding:22px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 70px #0008;display:grid;gap:14px}.help-content{display:grid;gap:13px}.help-content section{padding-bottom:11px;border-bottom:1px solid var(--border)}.help-content h3{margin:0 0 5px;font-size:12px}.help-content p{margin:0;color:var(--muted);font-size:11px;line-height:1.6}.help-content .help-footnote{padding-top:2px;font-size:10px}.help-dialog .dialog-actions{margin-top:0}@media(max-width:650px){.help-dialog{padding:18px}.help-card{align-items:flex-start;flex-direction:column}}
  `],
})
export class SettingsComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  readonly openSection = signal<'account' | 'appearance' | 'help' | null>(null);
  readonly helpWindowOpen = signal(false);
  readonly passwordWindowOpen = signal(false);
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly passwordError = signal('');
  readonly passwordErrorCode = signal(0);
  readonly passwordMessage = signal('');
  readonly deletePassword = signal('');
  readonly deleteConfirmation = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorCode = signal(0);
  readonly message = signal('');
  readonly fullscreen = signal(false);
  readonly fullscreenError = signal('');
  readonly hasPasswordProvider = computed(() => this.auth.user()?.providerData.some(provider => provider.providerId === 'password') ?? false);
  readonly canChangePassword = computed(() => this.currentPassword().length > 0 && this.newPassword().length >= 6 && this.newPassword() === this.confirmPassword());

  constructor() {
    if (!this.browser) return;
    const updateFullscreen = () => this.fullscreen.set(Boolean(this.document.fullscreenElement));
    updateFullscreen();
    this.document.addEventListener('fullscreenchange', updateFullscreen);
    this.destroyRef.onDestroy(() => this.document.removeEventListener('fullscreenchange', updateFullscreen));
  }

  toggleSection(section: 'account' | 'appearance' | 'help'): void { this.openSection.set(this.openSection() === section ? null : section); }
  setMode(mode: ColorMode): void { this.theme.setMode(mode); }

  openPasswordWindow(): void {
    this.passwordError.set('');
    this.passwordErrorCode.set(0);
    this.passwordMessage.set('');
    this.passwordWindowOpen.set(true);
  }

  closePasswordWindow(): void {
    if (this.busy()) return;
    this.passwordWindowOpen.set(false);
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.passwordError.set('');
    this.passwordErrorCode.set(0);
  }

  async toggleFullscreen(): Promise<void> {
    if (!this.browser) return;
    this.fullscreenError.set('');
    try {
      if (this.document.fullscreenElement) await this.document.exitFullscreen();
      else await this.document.documentElement.requestFullscreen();
    } catch {
      this.fullscreenError.set('Fullscreen is unavailable or was blocked by the browser.');
    }
  }

  async changePassword(): Promise<void> {
    if (!this.canChangePassword() || this.busy()) return;
    this.busy.set(true);
    this.passwordError.set('');
    this.passwordErrorCode.set(0);
    this.passwordMessage.set('');
    try {
      await this.auth.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordMessage.set('Your password has been changed.');
    } catch (error) {
      this.setError(error, 'password');
    } finally { this.busy.set(false); }
  }

  async deleteAccount(): Promise<void> {
    if (this.busy() || this.deleteConfirmation() !== 'DELETE') return;
    this.busy.set(true);
    this.error.set('');
    this.errorCode.set(0);
    this.message.set('');
    try {
      const token = await this.auth.reauthenticateForAccountDeletion(this.deletePassword());
      await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/account`, { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }));
      await this.auth.signOut();
      await this.router.navigate(['/login']);
    } catch (error) {
      this.setError(error, 'delete');
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  private setError(error: unknown, action: 'password' | 'delete'): void {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    let errorCode = action === 'password' ? 2004 : 3001;
    let message = error instanceof Error ? error.message : 'The account action failed. Please try again.';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) { errorCode = action === 'password' ? 2001 : 3001; message = 'The password is incorrect. Re-enter it and try again.'; }
    else if (code.includes('weak-password')) { errorCode = 2002; message = 'Choose a password with at least 6 characters.'; }
    else if (code.includes('requires-recent-login')) { errorCode = 2003; message = 'Please sign in again, then retry this action.'; }
    else if (code.includes('popup-closed-by-user')) { errorCode = 3001; message = 'Google reauthentication was cancelled.'; }
    else if (message.includes('cannot be reauthenticated')) { errorCode = 3004; }
    if (error instanceof HttpErrorResponse) {
      errorCode = error.status === 0 ? 3002 : 3003;
      const serverMessage = typeof error.error === 'object' && error.error !== null && 'error' in error.error && typeof error.error.error === 'string'
        ? error.error.error
        : '';
      message = error.status === 0
        ? 'Could not reach the account service. Check that the API server is running.'
        : error.status === 503 && serverMessage
          ? `${serverMessage} Account data was not deleted; restore API access to Firebase, then retry.`
          : `Account deletion failed on the server (${error.status}).`;
    }
    if (action === 'password') {
      this.passwordErrorCode.set(errorCode);
      this.passwordError.set(message);
    } else {
      this.errorCode.set(errorCode);
      this.error.set(message);
    }
  }
}

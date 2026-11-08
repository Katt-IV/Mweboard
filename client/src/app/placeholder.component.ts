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
      <p class="eyebrow">WORKSPACE</p><h1>Campaigns</h1>
      <p class="intro">Create a message and send it to every subscriber who opted in.</p>
      <section class="card">
        <form [formGroup]="form" (ngSubmit)="send()" novalidate>
          <mat-form-field appearance="fill" class="field">
            <mat-label>Campaign name</mat-label>
            <input matInput formControlName="name" maxlength="100" placeholder="November update">
            @if (form.controls.name.hasError('required')) { <mat-error>Campaign name is required.</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="fill" class="field">
            <mat-label>Message</mat-label>
            <textarea matInput formControlName="messageText" rows="6" [attr.maxlength]="imageDataUrl() ? 1024 : 4096" placeholder="Write your message. Emojis are supported."></textarea>
            <mat-hint align="end">{{ form.controls.messageText.value.length }} / {{ imageDataUrl() ? 1024 : 4096 }}</mat-hint>
          </mat-form-field>
          <div class="image-picker">
            <label for="campaign-image">Add a picture <span>JPEG or PNG, up to 5 MB</span></label>
            <input id="campaign-image" type="file" accept="image/jpeg,image/png" (change)="selectImage($event)">
            @if (imageDataUrl()) {
              <div class="preview"><img [src]="imageDataUrl()" alt="Selected campaign image"><button type="button" class="remove" (click)="removeImage()">Remove image</button></div>
            }
          </div>
          <p class="note">Messages are sent only to opted-in subscribers. WhatsApp may require an approved template when a recipient has not messaged you in the last 24 hours.</p>
          <button mat-flat-button color="primary" type="submit" [disabled]="form.controls.name.invalid || loading() || (!form.controls.messageText.value.trim() && !imageDataUrl())">
            {{ loading() ? 'Sending campaign…' : 'Send to all opted-in subscribers' }}
          </button>
        </form>
        @if (loading()) { <p class="loading" role="status">Starting your campaign…</p> }
        @if (imageError()) { <p class="error" role="alert">{{ imageError() }}</p> }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </section>
    </main>
  `,
  styles: [`:host{display:block;color:var(--text)}.page{max-width:960px;margin:0 auto}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.intro{color:var(--muted);margin:8px 0 24px;font-size:12px}.card{max-width:650px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 24px #00000012}form{display:grid;gap:12px}.field{width:100%}textarea{resize:vertical;min-height:100px}.image-picker{display:grid;gap:8px}.image-picker label{font-size:12px;font-weight:600}.image-picker label span{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-top:4px}.image-picker input{color:var(--muted);font-size:12px}.preview{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}.preview img{max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;border:1px solid var(--border)}.remove{background:none;color:var(--muted);border:0;text-decoration:underline;cursor:pointer}.note{color:var(--muted);font-size:11px;line-height:1.5;margin:2px 0}.loading{color:var(--muted);margin:14px 0 0}.error{color:var(--danger);margin:14px 0 0}@media(max-width:650px){.card{padding:18px}}`],
})
export class CampaignsComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    messageText: [''],
  });
  readonly imageDataUrl = signal('');
  readonly imageName = signal('');
  readonly imageError = signal('');

  async selectImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.imageError.set('');
    this.imageDataUrl.set('');
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { this.imageError.set('Choose a JPEG or PNG image.'); input.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { this.imageError.set('Images must be no larger than 5 MB.'); input.value = ''; return; }
    this.imageName.set(file.name);
    this.imageDataUrl.set(await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    }).catch(() => { this.imageError.set('Could not read the selected image.'); return ''; }));
  }

  removeImage() { this.imageDataUrl.set(''); this.imageName.set(''); this.imageError.set(''); }

  async send() {
    if (this.form.invalid || this.loading()) { this.form.markAllAsTouched(); return; }
    if (!this.form.controls.messageText.value.trim() && !this.imageDataUrl()) { this.error.set('Enter a message or add a picture.'); return; }
    const message = this.form.controls.messageText.value.trim();
    if (message.length > (this.imageDataUrl() ? 1024 : 4096)) { this.error.set(this.imageDataUrl() ? 'Image captions must be 1,024 characters or fewer.' : 'Messages must be 4,096 characters or fewer.'); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ id: string }>(
        `${environment.apiBaseUrl}/api/campaigns`,
        { name: this.form.controls.name.value.trim(), messageText: message, ...(this.imageDataUrl() ? { imageDataUrl: this.imageDataUrl(), imageName: this.imageName() } : {}) },
      ));
      this.snackBar.open(`Campaign started. ID: ${result.id}`, 'Close', { duration: 7000 });
      this.form.reset({ name: '', messageText: '' });
      this.removeImage();
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
    return 'Could not start the campaign. Please try again.';
  }
}
@Component({standalone:true, template:`<section class="page"><p class="eyebrow">WORKSPACE</p><h1>Message log</h1><article><h2>No messages to show yet</h2><p>Sent and delivery activity will appear here.</p></article></section>`, styles:[`.page{color:var(--text)}.eyebrow{font-size:10px;letter-spacing:1.3px;color:var(--muted)}h1{font-size:26px;margin:8px 0 24px}article{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;color:var(--muted)}article h2{color:var(--text);font-size:17px}`]})
export class MessagesComponent {}

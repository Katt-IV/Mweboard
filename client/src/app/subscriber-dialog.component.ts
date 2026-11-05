import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subscriber, SubscriberInput, SubscribersService } from './subscribers.service';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit subscriber' : 'Add subscriber' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <mat-form-field appearance="fill">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" autocomplete="name">
          @if (form.controls.name.hasError('required')) { <mat-error>Name is required.</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="fill">
          <mat-label>Phone (E.164)</mat-label>
          <input matInput formControlName="phone" placeholder="+9627XXXXXXXX" autocomplete="tel">
          @if (form.controls.phone.hasError('required')) { <mat-error>Phone number is required.</mat-error> }
          @if (form.controls.phone.hasError('pattern')) { <mat-error>Use E.164 format, for example +9627XXXXXXXX.</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="fill">
          <mat-label>Tags</mat-label>
          <input matInput formControlName="tags" placeholder="vip, new customer">
          <mat-hint>Separate tags with commas.</mat-hint>
        </mat-form-field>
        <mat-checkbox formControlName="optedIn">Subscriber has consented to receive WhatsApp messages</mat-checkbox>
        @if (error) { <p class="error" role="alert">{{ error }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Saving…' : data ? 'Save changes' : 'Add subscriber' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields { display:grid; gap:8px; min-width:min(420px,75vw); padding-top:8px; }
    .fields mat-form-field { width:100%; } .error { margin:0; color:#b42318; font-size:13px; }
    mat-checkbox { margin:5px 0 10px; }
  `],
})
export class SubscriberDialogComponent {
  readonly data = inject<Subscriber | null>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<SubscriberDialogComponent, boolean>);
  private readonly service = inject(SubscribersService);
  error = '';
  saving = false;
  readonly form = this.fb.nonNullable.group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    phone: [this.data?.phone ?? '', [Validators.required, Validators.pattern(/^\+[1-9]\d{7,14}$/)]],
    tags: [this.data?.tags.join(', ') ?? ''],
    optedIn: [this.data?.optedIn ?? false],
  });

  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    const input: SubscriberInput = {
      name: value.name.trim(),
      phone: value.phone.trim(),
      tags: value.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      optedIn: value.optedIn,
    };
    this.saving = true;
    this.error = '';
    try {
      if (this.data) await this.service.update(this.data.id, input);
      else await this.service.add(input);
      this.ref.close(true);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save subscriber.';
    } finally { this.saving = false; }
  }
}

@Component({
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete subscriber?</h2>
    <mat-dialog-content>This subscriber will be permanently removed.</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">Delete</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDeleteDialogComponent {}

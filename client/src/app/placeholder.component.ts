import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { ErrorMessageComponent } from './error-message.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, ErrorMessageComponent],
  template: `
    <main class="page">
      <p class="eyebrow">WORKSPACE</p><h1>Campaigns</h1>
      <p class="intro">Create campaigns and review scheduled or past activity.</p>
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="view() === 'create'" (click)="toggleView('create')"><span class="section-icon mi">add</span><span class="trigger-copy"><strong>Create campaign</strong><small>Compose a message and send it to opted-in subscribers</small></span><span class="chevron mi">{{ view() === 'create' ? 'expand_less' : 'expand_more' }}</span></button>
        @if (view() === 'create') { <div class="accordion-panel"><section class="card">
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
          <label class="schedule-field">Schedule for (optional)<input type="datetime-local" formControlName="scheduledAt" [min]="minimumScheduleDate()"><small>Leave blank to send as soon as you create the campaign.</small></label>
          <div class="image-picker">
            <label for="campaign-image">Add a picture <span>JPEG or PNG, up to 5 MB</span></label>
            <input id="campaign-image" type="file" accept="image/jpeg,image/png" (change)="selectImage($event)">
            @if (imageDataUrl()) {
              <div class="preview"><img [src]="imageDataUrl()" alt="Selected campaign image"><button type="button" class="remove" (click)="removeImage()">Remove image</button></div>
            }
          </div>
          <p class="note">Messages are sent only to opted-in subscribers. WhatsApp may require an approved template when a recipient has not messaged you in the last 24 hours.</p>
          <button mat-flat-button color="primary" type="submit" [disabled]="form.controls.name.invalid || loading() || (!form.controls.messageText.value.trim() && !imageDataUrl())">
            {{ loading() ? (form.controls.scheduledAt.value ? 'Scheduling campaign…' : 'Sending campaign…') : form.controls.scheduledAt.value ? 'Schedule campaign' : 'Send to all opted-in subscribers' }}
          </button>
        </form>
        @if (loading()) { <p class="loading" role="status">Starting your campaign…</p> }
        @if (imageError()) { <app-error-message [code]="1001" [message]="imageError()" /> }
        @if (error()) { <app-error-message [code]="formErrorCode()" [message]="error()" /> }
        </section></div> }
      </section>
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="view() === 'scheduled'" (click)="toggleView('scheduled')"><span class="section-icon mi">schedule</span><span class="trigger-copy"><strong>Scheduled campaign</strong><small>Review campaigns waiting to be sent</small></span><span class="chevron mi">{{ view() === 'scheduled' ? 'expand_less' : 'expand_more' }}</span></button>
        @if (view() === 'scheduled') { <div class="accordion-panel"><section class="card campaign-list">
          <div class="list-heading"><h2>Scheduled campaigns</h2><button type="button" (click)="refreshScheduled()" [disabled]="listLoading()">{{ listLoading() ? 'Refreshing…' : 'Refresh' }}</button></div>
          @if (listLoading()) { <p class="list-message">Loading campaigns…</p> }
          @else if (listError()) { <app-error-message [code]="1002" message="Scheduled campaigns could not be loaded. Check the API server and signed-in Firestore access." /> }
            @else { @if (scheduleActionError()) { <app-error-message [code]="1004" [message]="scheduleActionError()" /> } @if (scheduleActionMessage()) { <p class="action-message" role="status">{{ scheduleActionMessage() }}</p> }
            <div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Scheduled for</th><th>Messages sent</th><th>Actions</th></tr></thead><tbody>
            @for (campaign of visibleCampaigns(); track campaign.id) { <tr><td>{{ campaign.name }}</td><td>{{ campaign.status }}</td><td>@if (editingScheduleId() === campaign.id) { <input class="schedule-edit" type="datetime-local" [min]="minimumScheduleDate()" [value]="editScheduledAt()" (input)="editScheduledAt.set($any($event.target).value)"> } @else { {{ formatDate(campaign.scheduledAt) }} }</td><td>{{ campaign.sent }}</td><td class="row-actions">
              @if (editingScheduleId() === campaign.id) { <button type="button" [disabled]="scheduleActionBusy()" (click)="saveSchedule(campaign)">Save</button><button type="button" (click)="editingScheduleId.set(null)">Keep</button> }
              @else if (confirmCancelId() === campaign.id) { <button type="button" [disabled]="scheduleActionBusy()" (click)="cancelScheduledCampaign(campaign)">Confirm cancel</button><button type="button" (click)="confirmCancelId.set(null)">Keep</button> }
              @else { <button type="button" (click)="editSchedule(campaign)">Reschedule</button><button type="button" (click)="requestCancel(campaign)">Cancel</button> }
            </td></tr> }
            @empty { <tr><td colspan="5" class="empty">No scheduled campaigns yet.</td></tr> }
          </tbody></table></div> }
        </section></div> }
      </section>
      <section class="accordion">
        <button class="accordion-trigger" type="button" [attr.aria-expanded]="view() === 'history'" (click)="toggleView('history')"><span class="section-icon mi">history</span><span class="trigger-copy"><strong>Campaign history</strong><small>Search and review all campaign details</small></span><span class="chevron mi">{{ view() === 'history' ? 'expand_less' : 'expand_more' }}</span></button>
        @if (view() === 'history') { <div class="accordion-panel"><section class="card campaign-list">
          <label class="history-search"><span class="mi">search</span><input type="search" aria-label="Search campaign names or IDs" placeholder="Search by campaign name or ID" [value]="historySearch()" (input)="onHistorySearch($any($event.target).value)"></label>
          <div class="history-window" role="region" aria-label="Campaign history" [attr.aria-busy]="historyLoading()" (scroll)="onHistoryScroll($event)">
            @for (campaign of historyCampaigns(); track campaign.id) {
              <article class="history-item"><div class="history-heading"><div><h2>{{ campaign.name || 'Untitled campaign' }}</h2><code>{{ campaign.id }}</code></div><span class="status">{{ campaign.status }}</span></div>
                <dl><div><dt>Created</dt><dd>{{ campaign.createdAtLabel }}</dd></div><div><dt>Scheduled</dt><dd>{{ campaign.scheduledAtLabel }}</dd></div><div><dt>Language</dt><dd>{{ campaign.language || '—' }}</dd></div><div><dt>Audience tags</dt><dd>{{ campaign.audienceTags?.length ? campaign.audienceTags.join(', ') : 'All opted-in subscribers' }}</dd></div><div><dt>Messages sent</dt><dd>{{ campaign.sent ?? 0 }}</dd></div><div><dt>Delivered</dt><dd>{{ campaign.delivered ?? 0 }}</dd></div><div><dt>Read</dt><dd>{{ campaign.read ?? 0 }}</dd></div><div><dt>Failed</dt><dd>{{ campaign.failed ?? 0 }}</dd></div><div class="message-detail"><dt>Message</dt><dd>{{ campaign.messageText || campaign.templateName || '—' }}</dd></div></dl>
              </article>
            }
            @if (historyLoading()) { <p class="list-message">Loading campaigns…</p> }
            @else if (historyError()) { <app-error-message [code]="1003" message="Campaign history could not be loaded. Check the API server and Firestore connection." /> }
            @else if (historyCampaigns().length === 0) { <p class="empty">{{ historySearch() ? 'No campaigns match your search.' : 'No campaigns yet.' }}</p> }
            @else if (!historyHasMore()) { <p class="list-message">You’ve reached the end of campaign history.</p> }
          </div>
        </section></div> }
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--text)}.page{max-width:960px;margin:0 auto}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.intro{color:var(--muted);margin:8px 0 18px;font-size:12px}
    .accordion{margin:0 0 11px;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}.accordion-trigger{width:100%;min-height:76px;border:0;padding:14px 18px;background:var(--surface);color:var(--text);display:flex;align-items:center;gap:14px;text-align:left;cursor:pointer}.accordion-trigger:hover{background:var(--elevated)}.section-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--elevated);color:var(--accent);font-size:22px;flex:none}.trigger-copy{display:grid;gap:5px;flex:1}.trigger-copy strong{font-size:14px}.trigger-copy small{font-size:11px;color:var(--muted)}.chevron{font-size:20px;color:var(--muted)}.accordion-panel{padding:14px;border-top:1px solid var(--border)}
    .mi{font-family:'Material Symbols Rounded';font-size:19px;line-height:1}.list-message{color:var(--muted);font-size:12px}.card{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px #00000012}.campaign-list h2{font-size:16px;margin:0 0 8px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--border);font-size:12px}th{color:var(--muted);font-weight:500}.empty{padding:30px;text-align:center;color:var(--muted)}form{display:grid;gap:12px}.field{width:100%}textarea{resize:vertical;min-height:100px}.image-picker{display:grid;gap:8px}.image-picker label{font-size:12px;font-weight:600}.image-picker label span{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-top:4px}.image-picker input{color:var(--muted);font-size:12px}.preview{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}.preview img{max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;border:1px solid var(--border)}.remove{background:none;color:var(--muted);border:0;text-decoration:underline;cursor:pointer}.note{color:var(--muted);font-size:11px;line-height:1.5;margin:2px 0}.loading{color:var(--muted);margin:14px 0 0}.error{color:var(--danger);margin:14px 0 0}
    .schedule-field{display:grid;gap:7px;font-size:12px;font-weight:600;color:var(--text)}.schedule-field input{width:min(100%,340px);height:42px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--elevated);color:var(--text)}.schedule-field small{font-size:11px;font-weight:400;color:var(--muted)}.list-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.list-heading h2{margin:0}.list-heading button{padding:7px 10px;border:1px solid var(--border);border-radius:7px;background:var(--elevated);color:var(--text);cursor:pointer}.list-heading button:disabled{opacity:.55;cursor:wait}.row-actions{white-space:nowrap}.row-actions button{border:1px solid var(--border);border-radius:7px;background:var(--elevated);color:var(--text);padding:6px 8px;margin-right:5px;font-size:10px;cursor:pointer}.row-actions button:hover{border-color:var(--accent)}.schedule-edit{min-width:185px;max-width:205px;height:34px;padding:0 7px;border:1px solid var(--border);border-radius:7px;background:var(--elevated);color:var(--text)}.action-message{color:var(--success);font-size:12px}
    .history-search{height:42px;display:flex;align-items:center;gap:9px;padding:0 12px;margin:2px 0 12px;border:1px solid var(--border);border-radius:9px;background:var(--elevated);color:var(--muted)}.history-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:12px}.history-window{max-height:620px;overflow:auto;overscroll-behavior:contain;padding-right:4px}.history-item{padding:16px 0;border-bottom:1px solid var(--border)}.history-item:last-of-type{border-bottom:0}.history-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.history-heading h2{font-size:14px;margin:0 0 5px}.history-heading code{font-size:10px;color:var(--muted);overflow-wrap:anywhere}.status{border-radius:999px;background:var(--pending-bg);color:var(--pending);padding:5px 9px;font-size:10px;text-transform:capitalize;white-space:nowrap}.history-item dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0 0}.history-item dl>div{min-width:0}.history-item dt{font-size:10px;color:var(--muted);margin-bottom:4px}.history-item dd{font-size:11px;margin:0;overflow-wrap:anywhere}.history-item .message-detail{grid-column:1/-1}.history-item .message-detail dd{white-space:pre-wrap}.history-window .empty{text-align:center}.history-window .error{color:var(--danger);font-size:12px}@media(max-width:650px){.card{padding:14px}.history-item dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `],
})
export class CampaignsComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly formErrorCode = signal(1001);
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    messageText: [''],
    scheduledAt: [''],
  });
  readonly minimumScheduleDate = signal(this.localDateTime(new Date(Date.now() + 60_000)));
  readonly imageDataUrl = signal('');
  readonly imageName = signal('');
  readonly imageError = signal('');
  readonly view = signal<'menu' | 'create' | 'scheduled' | 'history'>('menu');
  readonly campaigns = signal<CampaignListItem[]>([]);
  readonly listLoading = signal(false);
  readonly listError = signal(false);
  readonly visibleCampaigns = computed(() => this.campaigns().filter(campaign => String(campaign.status ?? '').toLowerCase() === 'scheduled').sort((left, right) => (this.dateValue(left.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (this.dateValue(right.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER)));
  readonly historyCampaigns = signal<CampaignHistoryItem[]>([]);
  readonly historySearch = signal('');
  readonly historyCursor = signal<string | null>(null);
  readonly historyHasMore = signal(true);
  readonly historyLoading = signal(false);
  readonly historyError = signal(false);
  readonly historyLoaded = signal(false);
  readonly editingScheduleId = signal<string | null>(null);
  readonly editScheduledAt = signal('');
  readonly confirmCancelId = signal<string | null>(null);
  readonly scheduleActionError = signal('');
  readonly scheduleActionMessage = signal('');
  readonly scheduleActionBusy = signal(false);
  private historyGeneration = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private scheduledLoaded = false;

  constructor() {
    const scheduledAt = this.route.snapshot.queryParamMap.get('scheduledAt');
    const date = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledAt && date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now() + 60_000) {
      this.form.controls.scheduledAt.setValue(scheduledAt);
      this.view.set('create');
    }
  }

  async toggleView(view: 'create' | 'scheduled' | 'history'): Promise<void> {
    if (this.view() === view) { this.view.set('menu'); return; }
    this.view.set(view);
    if (view === 'create') return;
    if (view === 'history') {
      if (this.historyLoaded()) return;
      this.historyGeneration++;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.historyCampaigns.set([]);
      this.historyCursor.set(null);
      this.historyHasMore.set(true);
      this.historyError.set(false);
      this.historyLoading.set(false);
      await this.loadHistory(this.historyGeneration);
      return;
    }
    if (this.scheduledLoaded) return;
    await this.refreshScheduled();
  }

  async refreshScheduled(): Promise<void> {
    if (this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(false);
    try {
      this.campaigns.set(await firstValueFrom(this.http.get<CampaignListItem[]>(`${environment.apiBaseUrl}/api/campaigns/scheduled`)));
      this.scheduledLoaded = true;
    } catch {
      this.scheduledLoaded = false;
      this.listError.set(true);
    } finally {
      this.listLoading.set(false);
    }
  }

  onHistorySearch(value: string): void {
    this.historySearch.set(value);
    this.historyLoaded.set(false);
    this.historyGeneration++;
    const generation = this.historyGeneration;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.historyCampaigns.set([]);
    this.historyCursor.set(null);
    this.historyHasMore.set(true);
    this.historyError.set(false);
    this.historyLoading.set(false);
    this.searchTimer = setTimeout(() => void this.loadHistory(generation), 250);
  }

  onHistoryScroll(event: Event): void {
    const window = event.currentTarget as HTMLElement;
    if (window.scrollTop + window.clientHeight >= window.scrollHeight - 100) void this.loadHistory(this.historyGeneration);
  }

  formatDate(value: unknown): string {
    return this.dateValue(value)?.toLocaleString() ?? '—';
  }

  private dateValue(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value !== 'object') return null;
    const record = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof record.toDate === 'function') {
      const date = record.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    const seconds = Number(record.seconds ?? record._seconds);
    if (!Number.isFinite(seconds)) return null;
    return new Date(seconds * 1000);
  }

  private localDateTime(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  editSchedule(campaign: CampaignListItem): void {
    const date = this.dateValue(campaign.scheduledAt);
    if (!date) { this.scheduleActionError.set('This campaign has no valid scheduled time.'); return; }
    this.editingScheduleId.set(campaign.id);
    this.editScheduledAt.set(this.localDateTime(date));
    this.confirmCancelId.set(null);
    this.scheduleActionError.set('');
    this.scheduleActionMessage.set('');
  }

  requestCancel(campaign: CampaignListItem): void {
    this.confirmCancelId.set(campaign.id);
    this.editingScheduleId.set(null);
    this.scheduleActionError.set('');
    this.scheduleActionMessage.set('');
  }

  async saveSchedule(campaign: CampaignListItem): Promise<void> {
    const scheduledAt = new Date(this.editScheduledAt());
    if (!this.editScheduledAt() || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      this.scheduleActionError.set('Choose a schedule time in the future.');
      return;
    }
    this.scheduleActionBusy.set(true);
    this.scheduleActionError.set('');
    this.scheduleActionMessage.set('');
    try {
      await firstValueFrom(this.http.patch<void>(`${environment.apiBaseUrl}/api/campaigns/${encodeURIComponent(campaign.id)}/schedule`, { scheduledAt: scheduledAt.toISOString() }));
      this.campaigns.update(items => items.map(item => item.id === campaign.id ? { ...item, scheduledAt: scheduledAt.toISOString() } : item));
      this.editingScheduleId.set(null);
      this.scheduleActionMessage.set('Campaign schedule updated.');
    } catch (error) {
      this.scheduleActionError.set(this.scheduleErrorMessage(error));
    } finally { this.scheduleActionBusy.set(false); }
  }

  async cancelScheduledCampaign(campaign: CampaignListItem): Promise<void> {
    this.scheduleActionBusy.set(true);
    this.scheduleActionError.set('');
    this.scheduleActionMessage.set('');
    try {
      await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/campaigns/${encodeURIComponent(campaign.id)}`));
      this.campaigns.update(items => items.filter(item => item.id !== campaign.id));
      this.confirmCancelId.set(null);
      this.scheduleActionMessage.set('Scheduled campaign cancelled.');
    } catch (error) {
      this.scheduleActionError.set(this.scheduleErrorMessage(error));
    } finally { this.scheduleActionBusy.set(false); }
  }

  private scheduleErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { error?: unknown } | null;
      if (typeof body?.error === 'string') return body.error;
      if (error.status === 0) return 'Could not reach the API server.';
      return `Campaign schedule action failed (${error.status}).`;
    }
    return 'Campaign schedule action failed. Please try again.';
  }

  private async loadHistory(generation: number): Promise<void> {
    if (generation !== this.historyGeneration || this.historyLoading() || !this.historyHasMore()) return;
    this.historyLoading.set(true);
    this.historyError.set(false);
    let params = new HttpParams().set('limit', '30').set('search', this.historySearch().trim());
    const cursor = this.historyCursor();
    if (cursor) params = params.set('cursor', cursor);
    try {
      const page = await firstValueFrom(this.http.get<CampaignHistoryPage>(`${environment.apiBaseUrl}/api/campaigns/history`, { params }));
      if (generation !== this.historyGeneration) return;
      this.historyCampaigns.update(items => [...items, ...page.items.map(item => ({ ...item, createdAtLabel: this.formatDate(item.createdAt), scheduledAtLabel: this.formatDate(item.scheduledAt) }))]);
      this.historyCursor.set(page.nextCursor);
      this.historyHasMore.set(page.nextCursor !== null);
      this.historyLoaded.set(true);
    } catch {
      if (generation === this.historyGeneration) this.historyError.set(true);
    } finally {
      if (generation === this.historyGeneration) this.historyLoading.set(false);
    }
  }

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
    const scheduleInput = this.form.controls.scheduledAt.value;
    const scheduledAt = scheduleInput ? new Date(scheduleInput) : null;
    if (scheduleInput && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) { this.error.set('Choose a schedule time in the future.'); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ id: string }>(
        `${environment.apiBaseUrl}/api/campaigns`,
        { name: this.form.controls.name.value.trim(), messageText: message, ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}), ...(this.imageDataUrl() ? { imageDataUrl: this.imageDataUrl(), imageName: this.imageName() } : {}) },
      ));
      this.snackBar.open(scheduledAt ? `Campaign scheduled. ID: ${result.id}` : `Campaign started. ID: ${result.id}`, 'Close', { duration: 7000 });
      this.form.reset({ name: '', messageText: '', scheduledAt: '' });
      this.removeImage();
      this.scheduledLoaded = false;
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

interface CampaignListItem { id: string; name: string; status: string; sent: number; scheduledAt?: unknown }
interface CampaignHistoryPage { items: CampaignHistoryItem[]; nextCursor: string | null }
interface CampaignHistoryItem { id: string; name?: string; status?: string; language?: string; audienceTags?: string[]; templateName?: string; messageText?: string; sent?: number; delivered?: number; read?: number; failed?: number; createdAt?: unknown; scheduledAt?: unknown; createdAtLabel?: string; scheduledAtLabel?: string }
@Component({standalone:true, template:`<section class="page"><p class="eyebrow">WORKSPACE</p><h1>Message log</h1><article><h2>No messages to show yet</h2><p>Sent and delivery activity will appear here.</p></article></section>`, styles:[`.page{color:var(--text)}.eyebrow{font-size:10px;letter-spacing:1.3px;color:var(--muted)}h1{font-size:26px;margin:8px 0 24px}article{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;color:var(--muted)}article h2{color:var(--text);font-size:17px}`]})
export class MessagesComponent {}

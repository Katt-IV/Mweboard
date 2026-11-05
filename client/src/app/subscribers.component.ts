import { AfterViewInit, Component, OnInit, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { Subscriber, SubscriberInput, SubscribersService } from './subscribers.service';
import { ConfirmDeleteDialogComponent, SubscriberDialogComponent } from './subscriber-dialog.component';

@Component({
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule, MatPaginatorModule],
  template: `
    <main class="page">
      <div class="heading">
        <div><p class="eyebrow">AUDIENCE</p><h1>Subscribers</h1><p>Manage contacts and their WhatsApp consent.</p></div>
        <div class="actions">
          <input #csvInput hidden type="file" accept=".csv,text/csv" (change)="importCsv($event)">
          <button mat-stroked-button (click)="csvInput.click()" [disabled]="importing">Import CSV</button>
          <button mat-flat-button color="primary" (click)="openAdd()">Add subscriber</button>
        </div>
      </div>
      @if (summary) { <p class="summary" role="status">{{ summary }}</p> }
      @if (loadError) { <p class="error" role="alert">{{ loadError }}</p> }
      <section class="panel">
        <div class="filters">
          <mat-form-field appearance="fill" class="search">
            <mat-label>Search name, phone, or tag</mat-label>
            <input matInput (input)="search($any($event.target).value)">
          </mat-form-field>
          <mat-form-field appearance="fill" class="tag-filter">
            <mat-label>Filter by tag</mat-label>
            <mat-select [(value)]="selectedTag" (selectionChange)="applyFilters()">
              <mat-option value="">All tags</mat-option>
              @for (tag of tags; track tag) { <mat-option [value]="tag">{{ tag }}</mat-option> }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="table-wrap">
          <table mat-table [dataSource]="dataSource" class="subscriber-table">
            <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>Name</th><td mat-cell *matCellDef="let row">{{ row.name }}</td></ng-container>
            <ng-container matColumnDef="phone"><th mat-header-cell *matHeaderCellDef>Phone</th><td mat-cell *matCellDef="let row">{{ row.phone }}</td></ng-container>
            <ng-container matColumnDef="tags"><th mat-header-cell *matHeaderCellDef>Tags</th><td mat-cell *matCellDef="let row">{{ row.tags.join(', ') || '—' }}</td></ng-container>
            <ng-container matColumnDef="optedIn"><th mat-header-cell *matHeaderCellDef>Consent</th><td mat-cell *matCellDef="let row">{{ row.optedIn ? 'Consented' : 'Not consented' }}</td></ng-container>
            <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef>Actions</th><td mat-cell *matCellDef="let row"><button mat-button (click)="edit(row)">Edit</button><button mat-button color="warn" (click)="remove(row)">Delete</button></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr class="mat-mdc-row" *matNoDataRow><td class="mat-mdc-cell empty" [attr.colspan]="columns.length">@if (loading) { <div class="skeleton-lines" aria-label="Loading subscribers"><i></i><i></i><i></i></div> } @else { No subscribers found. Add a subscriber or import a CSV to get started. }</td></tr>
          </table>
        </div>
        <mat-paginator [pageSizeOptions]="[10, 25, 50]" [pageSize]="10" showFirstLastButtons aria-label="Select subscriber page"></mat-paginator>
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--text)}.page{max-width:1200px;margin:0 auto}.heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px}.heading p:not(.eyebrow){color:var(--muted);margin:8px 0 0;font-size:12px}.actions{display:flex;gap:10px}.panel{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:16px}.filters{display:flex;gap:14px}.search{flex:1}.tag-filter{width:220px}.table-wrap{overflow:auto}.subscriber-table{width:100%;min-width:720px}.empty{text-align:center;padding:28px;color:var(--muted)}.summary{padding:12px 16px;color:var(--success);background:var(--success-bg);border-radius:10px}.error{color:var(--danger)}.skeleton-lines{max-width:440px;margin:auto;display:grid;gap:9px}.skeleton-lines i{height:12px;border-radius:6px;background:linear-gradient(90deg,var(--elevated),#3a414a,var(--elevated));background-size:200% 100%;animation:shimmer 1.2s infinite}.skeleton-lines i:nth-child(2){width:84%}.skeleton-lines i:nth-child(3){width:65%}@keyframes shimmer{to{background-position:-200% 0}}@media(max-width:650px){.heading{align-items:flex-start;flex-direction:column}.filters{flex-direction:column;gap:0}.tag-filter{width:100%}.actions{flex-wrap:wrap}}
  `],
})
export class SubscribersComponent implements OnInit, AfterViewInit {
  private readonly service = inject(SubscribersService);
  private readonly dialog = inject(MatDialog);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  readonly columns = ['name', 'phone', 'tags', 'optedIn', 'actions'];
  readonly dataSource = new MatTableDataSource<Subscriber>([]);
  tags: string[] = [];
  selectedTag = '';
  loading = true;
  importing = false;
  loadError = '';
  summary = '';

  constructor() {
    this.dataSource.filterPredicate = (row, rawFilter) => {
      const filter = JSON.parse(rawFilter) as { search: string; tag: string };
      const matchesSearch = !filter.search || [row.name, row.phone, ...row.tags].some(value => value.toLowerCase().includes(filter.search));
      const matchesTag = !filter.tag || row.tags.some(tag => tag.toLowerCase() === filter.tag.toLowerCase());
      return matchesSearch && matchesTag;
    };
  }

  ngOnInit() { void this.refresh(); }
  ngAfterViewInit() { this.dataSource.paginator = this.paginator; }

  async refresh() {
    this.loading = true;
    this.loadError = '';
    try {
      this.dataSource.data = await this.service.list();
      this.tags = [...new Set(this.dataSource.data.flatMap(row => row.tags))].sort((a, b) => a.localeCompare(b));
      this.applyFilters();
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Could not load subscribers.';
    } finally { this.loading = false; }
  }

  search(value: string) { this.dataSource.filter = JSON.stringify({ search: value.trim().toLowerCase(), tag: this.selectedTag }); }
  applyFilters() {
    const current = this.dataSource.filter ? JSON.parse(this.dataSource.filter) as { search: string } : { search: '' };
    this.dataSource.filter = JSON.stringify({ search: current.search, tag: this.selectedTag });
    if (this.paginator) this.paginator.firstPage();
  }

  openAdd() { this.openDialog(null); }
  edit(row: Subscriber) { this.openDialog(row); }

  private openDialog(row: Subscriber | null) {
    const ref = this.dialog.open(SubscriberDialogComponent, { width: '480px', maxWidth: '95vw', data: row });
    ref.afterClosed().subscribe(async (saved: boolean | undefined) => {
      if (!saved) return;
      this.summary = row ? 'Subscriber updated.' : 'Subscriber added.';
      await this.refresh();
    });
  }

  remove(row: Subscriber) {
    this.dialog.open(ConfirmDeleteDialogComponent, { width: '380px' }).afterClosed().subscribe(async confirmed => {
      if (!confirmed) return;
      try { await this.service.delete(row.id); this.summary = 'Subscriber deleted.'; await this.refresh(); }
      catch (error) { this.summary = error instanceof Error ? error.message : 'Could not delete subscriber.'; }
    });
  }

  async importCsv(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing = true;
    this.summary = '';
    let imported = 0;
    let skipped = 0;
    try {
      const records = this.parseCsv(await file.text());
      const header = records.shift()?.map(value => value.trim().toLowerCase()) ?? [];
      const nameIndex = header.indexOf('name');
      const phoneIndex = header.indexOf('phone');
      const tagsIndex = header.indexOf('tags');
      if (nameIndex < 0 || phoneIndex < 0 || tagsIndex < 0) {
        this.summary = 'CSV must include name, phone, and tags columns.';
        return;
      }
      for (const row of records) {
        const name = (row[nameIndex] ?? '').trim();
        const phone = (row[phoneIndex] ?? '').trim();
        if (!name || name.length > 120 || !/^\+[1-9]\d{7,14}$/.test(phone)) { skipped++; continue; }
        const data: SubscriberInput = {
          name,
          phone,
          tags: (row[tagsIndex] ?? '').split(/[|,;]/).map(tag => tag.trim()).filter(Boolean),
          optedIn: false,
        };
        try { await this.service.add(data); imported++; }
        catch { skipped++; }
      }
      this.summary = `CSV import complete: ${imported} imported, ${skipped} skipped.`;
      await this.refresh();
    } catch (error) {
      this.summary = error instanceof Error ? `CSV import failed: ${error.message}` : 'CSV import failed.';
    } finally { this.importing = false; input.value = ''; }
  }

  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index++;
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
        row = []; cell = '';
      } else cell += char;
    }
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }

}

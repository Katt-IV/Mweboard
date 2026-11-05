import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { SidebarComponent } from './sidebar.component';
import { CalendarWidgetComponent } from './dashboard-widgets.component';

@Component({
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, CalendarWidgetComponent],
  template: `
    <div class="layout">
      <button class="hamburger" aria-label="Open navigation" (click)="drawer.set(!drawer())"><span class="mi">menu</span></button>
      @if (drawer()) { <button class="scrim" aria-label="Close navigation" (click)="drawer.set(false)"></button> }
      <app-sidebar [open]="drawer()" (navigate)="drawer.set(false)" />
      <div class="center"><header class="topbar"><div class="crumb">Workspace <span>/</span> {{ title() }}</div><button class="account-trigger" (click)="accountMenu.set(!accountMenu())"><span class="mi">account_circle</span>Account<span class="mi">expand_more</span></button>@if(accountMenu()){<div class="account-menu"><button (click)="logout()"><span class="mi">logout</span>Log out</button></div>}</header><main><router-outlet /></main></div>
      <aside class="right-rail"><section class="rail-card account"><div class="rail-title">Account</div><p>Workspace account</p><button class="account-action" (click)="logout()"><span class="mi">logout</span>Log out</button></section>
        <app-calendar-widget [scheduledDates]="['2026-11-16']" />
        <section class="rail-card activity"><div class="rail-title">Activity <span class="live">SAMPLE</span></div><div class="activity-row"><i class="ok"></i><div><b>Campaign delivered</b><small>Nov 03 · Sample activity</small></div></div><div class="activity-row"><i class="wait"></i><div><b>Message sent</b><small>Nov 02 · Sample activity</small></div></div><div class="activity-row"><i class="fail"></i><div><b>Delivery failed</b><small>Nov 01 · Sample activity</small></div></div></section>
      </aside>
    </div>`,
  styles: [`
    .layout{min-height:100vh;display:grid;grid-template-columns:240px minmax(0,1fr) 340px;background:var(--page)}
    .mi{font-family:'Material Symbols Rounded';font-size:20px;line-height:1}
    .center{min-width:0}.topbar{height:74px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 32px;color:var(--muted);position:relative}.crumb{font-size:13px}.crumb span{padding:0 8px;color:#515966}.account-trigger{color:var(--text);background:none;border:0;display:flex;align-items:center;gap:8px;cursor:pointer;padding:9px}.account-menu{position:absolute;right:24px;top:62px;padding:6px;background:var(--elevated);border:1px solid var(--border);border-radius:10px;z-index:5;box-shadow:0 8px 24px #0005}.account-menu button{border:0;background:none;color:var(--text);display:flex;gap:10px;padding:10px 14px;cursor:pointer}.center main{padding:30px 32px 48px;max-width:1500px;margin:auto}
    .right-rail{padding:28px 22px;border-left:1px solid var(--border);display:grid;align-content:start;gap:18px}.rail-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.08)}.rail-title{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:14px}.account p{color:var(--muted);font-size:12px;margin:14px 0}.account-action{border:0;background:transparent;color:var(--muted);padding:6px 0;display:flex;align-items:center;gap:8px;cursor:pointer}.activity .rail-title{margin-bottom:16px}.live{font-size:9px;letter-spacing:1px;color:var(--success);background:var(--success-bg);padding:4px 7px;border-radius:5px}.activity-row{display:flex;gap:10px;padding:12px 0;border-top:1px solid var(--border)}.activity-row>i{margin-top:4px;width:8px;height:8px;border-radius:50%;flex:none}.ok{background:var(--success)}.wait{background:var(--accent)}.fail{background:#69717d}.activity-row b{font-size:11px;display:block;font-weight:500}.activity-row small{font-size:10px;color:var(--muted);display:block;margin-top:5px}.hamburger,.scrim{display:none}
    @media(max-width:1279px){.layout{grid-template-columns:240px minmax(0,1fr)}.right-rail{grid-column:2;grid-row:2;border-left:0;border-top:1px solid var(--border);grid-template-columns:repeat(3,minmax(0,1fr));padding:20px 32px}.center{grid-column:2;grid-row:1}.right-rail .calendar{min-height:220px}}
    @media(max-width:899px){.layout{display:block}.hamburger{width:40px;height:40px;border:1px solid var(--border);border-radius:12px;padding:8px}.hamburger{display:inline-flex;position:fixed;z-index:3;top:15px;left:12px;color:var(--text);background:var(--surface)}.scrim{display:block;position:fixed;inset:0;background:#0009;z-index:3;border:0}.topbar{padding-left:64px}.right-rail{grid-template-columns:1fr;padding:18px}.center main{padding:22px 18px 36px}}
  `],
})
export class AppShellComponent {
  readonly drawer = signal(false);
  readonly accountMenu = signal(false);
  readonly title = signal('Dashboard');
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  constructor() { this.router.events.subscribe(() => { const route = this.router.url.split('/')[1]; this.title.set(route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Dashboard'); }); }
  async logout() { await this.auth.signOut(); await this.router.navigate(['/login']); }
}

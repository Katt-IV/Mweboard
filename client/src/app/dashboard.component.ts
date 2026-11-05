import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatButtonModule, MatMenuModule],
  template: `
    <header class="navbar">
      <nav aria-label="Main navigation">
        <a routerLink="/dashboard" class="brand">Dashboard</a>
        <a routerLink="/subscribers" routerLinkActive="active" class="nav-link">Subscribers</a>
        <a routerLink="/settings" routerLinkActive="active" class="nav-link">Settings</a>
      </nav>
      <button mat-button [matMenuTriggerFor]="accountMenu">Account</button>
      <mat-menu #accountMenu="matMenu">
        <button mat-menu-item (click)="logout()">Log out</button>
      </mat-menu>
    </header>
    <main class="dashboard"><h1>Dashboard</h1><p>Your dashboard is ready.</p></main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:#f7f8fa; color:#202124; font-family:Arial,sans-serif; }
    .navbar { height:64px; display:flex; align-items:center; justify-content:space-between; padding:0 32px; background:white; border-bottom:1px solid #e5e7eb; }
    nav { display:flex; align-items:center; gap:24px; } .brand,.nav-link { color:inherit; text-decoration:none; } .brand { font-weight:700; } .nav-link { color:#667085; } .nav-link.active { color:#3f51b5; font-weight:600; } .dashboard { max-width:1100px; margin:48px auto; padding:0 24px; }
    h1 { font-size:28px; } p { color:#667085; }
  `],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  async logout() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}

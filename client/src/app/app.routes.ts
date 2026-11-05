import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./login.component').then(m => m.LoginComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent) },
  { path: 'subscribers', canActivate: [authGuard], loadComponent: () => import('./subscribers.component').then(m => m.SubscribersComponent) },
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./settings.component').then(m => m.SettingsComponent) },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];

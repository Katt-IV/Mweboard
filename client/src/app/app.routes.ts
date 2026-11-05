import { Routes } from '@angular/router';
import { AppShellComponent } from './app-shell.component';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./login.component').then(m => m.LoginComponent) },
  { path: '', component: AppShellComponent, canActivate: [authGuard], children: [
    { path: 'dashboard', loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent) },
    { path: 'subscribers', loadComponent: () => import('./subscribers.component').then(m => m.SubscribersComponent) },
    { path: 'settings', loadComponent: () => import('./settings.component').then(m => m.SettingsComponent) },
    { path: 'campaigns', loadComponent: () => import('./placeholder.component').then(m => m.CampaignsComponent) },
    { path: 'messages', loadComponent: () => import('./placeholder.component').then(m => m.MessagesComponent) },
  ] },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];

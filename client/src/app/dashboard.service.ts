import { Injectable, InjectionToken } from '@angular/core';

export type ActivityPeriod = 'Daily' | 'Weekly' | 'Monthly';
export interface DashboardCampaign { id: string; name: string; audience: string; scheduledFor: string; sent: number; status: 'Delivered' | 'Scheduled' | 'Failed' | 'Pending'; }
export interface DashboardSummary { campaignCount: number; messagesSent: number; readRate: number; delivered: number; pending: number; failed: number; }
export interface DashboardSnapshot { readonly source: 'mock'; readonly summary: DashboardSummary; readonly campaigns: readonly DashboardCampaign[]; readonly labels: Record<ActivityPeriod, readonly string[]>; readonly messages: Record<ActivityPeriod, readonly number[]>; }
export interface DashboardDataProvider { getSnapshot(): DashboardSnapshot; }

@Injectable({ providedIn: 'root' })
export class MockDashboardService implements DashboardDataProvider {
  getSnapshot(): DashboardSnapshot {
    return {
      source: 'mock',
      summary: { campaignCount: 12, messagesSent: 8460, readRate: 68, delivered: 6840, pending: 820, failed: 800 },
      campaigns: [
        { id: 'cmp-1', name: 'November product update', audience: 'All subscribers', scheduledFor: 'Nov 12, 2026', sent: 3240, status: 'Delivered' },
        { id: 'cmp-2', name: 'Early access announcement', audience: 'VIP customers', scheduledFor: 'Nov 16, 2026', sent: 0, status: 'Scheduled' },
        { id: 'cmp-3', name: 'Welcome series · 02', audience: 'New subscribers', scheduledFor: 'Nov 03, 2026', sent: 860, status: 'Delivered' },
      ],
      labels: { Daily: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], Weekly: ['W1','W2','W3','W4','W5','W6','W7'], Monthly: ['May','Jun','Jul','Aug','Sep','Oct','Nov'] },
      messages: { Daily: [24,38,31,55,43,69,58], Weekly: [110,168,142,205,182,246,220], Monthly: [310,420,380,550,490,720,610] },
    };
  }
}
export const DASHBOARD_DATA = new InjectionToken<DashboardDataProvider>('DASHBOARD_DATA', { providedIn: 'root', factory: () => new MockDashboardService() });

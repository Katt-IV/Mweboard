// Owner-scoped Firestore reads for dashboard metrics, campaign updates, and recent activity.
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where,
} from '@angular/fire/firestore';

export type ActivityPeriod = 'Daily' | 'Weekly' | 'Monthly';
export type CampaignStatus = 'Completed' | 'Scheduled' | 'Failed' | 'Pending';

export interface DashboardCampaign {
  id: string;
  name: string;
  audience: string;
  scheduledFor: string;
  scheduledAt: Date | null;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  status: CampaignStatus;
}

export interface DashboardActivity {
  id: string;
  title: string;
  detail: string;
  status: string;
}

export interface DashboardSeries {
  labels: string[];
  messages: number[];
}

interface DailyStats {
  date: string;
  sent: number;
}

interface PeriodBucket {
  key: string;
  label: string;
}

/**
 * Converts Firestore timestamp-like values to a display date without exposing document data.
 * @param value The campaign date value returned by Firestore.
 * @returns A short localized date or an em dash when the value is absent or invalid.
 */
function displayDate(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  return '—';
}

function timestampDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/**
 * Converts a stored campaign status into the labels already used by the dashboard.
 * @param value The raw campaign status.
 * @returns A status label suitable for the campaign table.
 */
function campaignStatus(value: unknown): CampaignStatus {
  if (value === 'completed') return 'Completed';
  if (value === 'scheduled') return 'Scheduled';
  if (value === 'failed') return 'Failed';
  return 'Pending';
}

/**
 * Formats a Firestore campaign status into non-sensitive activity text.
 * @param value The raw campaign status.
 * @returns A short activity title.
 */
function activityTitle(value: unknown): string {
  const status = typeof value === 'string' ? value : 'updated';
  return `Campaign ${status}`;
}

/**
 * Returns a UTC YYYY-MM-DD key so dashboard ranges match server-maintained stats documents.
 * @param date The date to format.
 * @returns The zero-padded UTC calendar date.
 */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the selected UTC date buckets used to aggregate daily stats on the client.
 * @param period The range selected in the chart.
 * @returns Ordered bucket keys and labels for the chart.
 */
function periodBuckets(period: ActivityPeriod): PeriodBucket[] {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (period === 'Daily') {
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(utcToday);
      date.setUTCDate(date.getUTCDate() - 13 + index);
      return { key: dateKey(date), label: date.toLocaleDateString('en', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }) };
    });
  }
  if (period === 'Weekly') {
    const monday = new Date(utcToday);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    monday.setUTCDate(monday.getUTCDate() - 7 * 7);
    return Array.from({ length: 8 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + 7 * index);
      return { key: dateKey(date), label: date.toLocaleDateString('en', { timeZone: 'UTC', month: 'short', day: 'numeric' }) };
    });
  }
  const firstMonth = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth() - 5, 1));
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1));
    return { key: dateKey(date).slice(0, 7), label: date.toLocaleDateString('en', { timeZone: 'UTC', month: 'short' }) };
  });
}

/**
 * Provides the dashboard's minimal Firestore reads and single campaign listener.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /**
   * Counts this user's subscribers with a server-side aggregation instead of downloading every document.
   * @returns The number of subscribers owned by the signed-in user.
   */
  async getSubscriberCount(): Promise<number> {
    const subscribers = collection(this.firestore, 'subscribers');
    const result = await getCountFromServer(query(subscribers, where('ownerUid', '==', this.currentUid())));
    return result.data().count;
  }

  /**
   * Watches the user's campaign documents once; this stream drives all campaign-derived dashboard widgets.
   * @param next Receives the current owner-scoped campaign rows.
   * @param error Receives Firestore listener errors.
   * @returns The unsubscribe function to call when the dashboard is destroyed.
   */
  watchCampaigns(next: (campaigns: DashboardCampaign[]) => void, error: (reason: unknown) => void): Unsubscribe {
    const campaigns = collection(this.firestore, 'campaigns');
    const campaignQuery = query(
      campaigns,
      where('ownerUid', '==', this.currentUid()),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(campaignQuery, snapshot => {
      next(snapshot.docs.map(item => {
        const data = item.data();
        const tags = Array.isArray(data['audienceTags']) ? data['audienceTags'].filter((tag): tag is string => typeof tag === 'string') : [];
        return {
          id: item.id,
          name: typeof data['name'] === 'string' ? data['name'] : 'Untitled campaign',
          audience: tags.length ? tags.join(', ') : 'All subscribers',
          scheduledFor: displayDate(data['scheduledAt']),
          scheduledAt: timestampDate(data['scheduledAt']),
          sent: Number(data['sent'] ?? 0),
          delivered: Number(data['delivered'] ?? 0),
          read: Number(data['read'] ?? 0),
          failed: Number(data['failed'] ?? 0),
          status: campaignStatus(data['status']),
        };
      }));
    }, error);
  }

  /**
   * Reads daily stats for the selected range and aggregates them into chart buckets on the client.
   * @param period The selected chart range.
   * @returns Labels and sent-message totals for the chart.
   */
  async getMessageSeries(period: ActivityPeriod): Promise<DashboardSeries> {
    const buckets = periodBuckets(period);
    const start = buckets[0].key;
    const today = dateKey(new Date());
    const stats = collection(this.firestore, 'stats');
    const snapshot = await getDocs(query(
      stats,
      where('ownerUid', '==', this.currentUid()),
      where('date', '>=', start),
      where('date', '<=', today),
    ));
    const totals = new Map<string, number>();
    for (const item of snapshot.docs) {
      const data = item.data() as DailyStats;
      const key = period === 'Monthly' ? data.date.slice(0, 7) : period === 'Weekly' ? weekStart(data.date) : data.date;
      totals.set(key, (totals.get(key) ?? 0) + Number(data.sent ?? 0));
    }
    return { labels: buckets.map(bucket => bucket.label), messages: buckets.map(bucket => totals.get(period === 'Monthly' ? bucket.key : period === 'Weekly' ? weekStart(bucket.key) : bucket.key) ?? 0) };
  }

  /**
   * Reads the latest owner-scoped campaigns for the activity rail.
   * @returns Recent message activity without recipient phone numbers or message content.
   */
  async getRecentActivity(): Promise<DashboardActivity[]> {
    const campaigns = collection(this.firestore, 'campaigns');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snapshot = await getDocs(query(
      campaigns,
      where('ownerUid', '==', this.currentUid()),
      where('createdAt', '>=', sevenDaysAgo),
      orderBy('createdAt', 'desc'),
      limit(5),
    ));
    return snapshot.docs.map(item => ({
      id: item.id,
      title: activityTitle(item.get('status')),
      detail: displayDate(item.get('createdAt')),
      status: typeof item.get('status') === 'string' ? item.get('status') : 'draft',
    }));
  }

  /**
   * Requires an authenticated Firebase user before any dashboard query can be constructed.
   * @returns The signed-in user's Firebase UID.
   */
  private currentUid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in to view the dashboard.');
    return uid;
  }
}

/**
 * Converts a UTC date string to its week's Monday key for client-side weekly aggregation.
 * @param value A YYYY-MM-DD date.
 * @returns The Monday YYYY-MM-DD key for that week.
 */
function weekStart(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return dateKey(date);
}

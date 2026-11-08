import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import { ActivityPeriod, DashboardCampaign, DashboardService, DashboardSeries } from './dashboard.service';
import { CardComponent, StatCardComponent, StatusPillComponent } from './dashboard-widgets.component';

Chart.register(...registerables);
type CampaignTab = 'All' | 'Scheduled' | 'Completed';

@Component({
  standalone:true,
  imports:[DecimalPipe,BaseChartDirective,CardComponent,StatCardComponent,StatusPillComponent],
  template:`
    <div class="page-head"><div><p class="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p class="subhead">A clear view of your audience and campaign performance.</p></div><form class="search" (submit)="$event.preventDefault()"><input aria-label="Search campaigns" placeholder="Search campaigns" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)"><button aria-label="Search"><span class="mi">search</span></button></form></div>
    <div class="stats">
      <app-stat-card label="Total Subscribers" [value]="subscriberCount() === null ? '—' : subscriberCount()!.toLocaleString()" icon="groups" tone="purple" [hint]="subscriberError() ? 'Could not load' : subscriberCount() === null ? 'Loading' : 'Owner subscribers'" [error]="subscriberError() ? 'Unable to load subscriber count.' : ''" />
      <app-stat-card label="Campaigns" [value]="campaignError() ? '—' : summary().campaignCount.toLocaleString()" icon="campaign" tone="rose" [hint]="campaignError() ? 'Could not load' : 'All campaigns'" [error]="campaignError() ? 'Unable to load campaign data.' : ''" />
      <app-stat-card label="Messages Sent" [value]="campaignError() ? '—' : summary().sent.toLocaleString()" icon="send" tone="blue" [hint]="campaignError() ? 'Could not load' : 'Across campaigns'" [error]="campaignError() ? 'Unable to load campaign data.' : ''" />
      <app-stat-card label="Read Rate" [value]="campaignError() ? '—' : readRate()" icon="mark_email_read" tone="tan" [hint]="campaignError() ? 'Could not load' : 'Read / delivered'" [error]="campaignError() ? 'Unable to load campaign data.' : ''" />
    </div>
    <div class="charts">
      <app-card><div class="card-heading"><div><h2>Statistics</h2><p>Messages sent over time</p></div><label class="sort">Sort by <select [value]="period()" (change)="setPeriod($event)"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label></div>@if(seriesError()){<p class="widget-error" role="alert">Unable to load statistics.</p>}@else{<div class="bar-wrap"><canvas baseChart [type]="'bar'" [data]="barData()" [options]="barOptions" aria-label="Messages sent chart"></canvas></div>}</app-card>
      <app-card><div class="card-heading"><div><h2>Delivery</h2><p>Message delivery status</p></div></div>@if(campaignError()){<p class="widget-error" role="alert">Unable to load delivery data.</p>}@else{<div class="donut-wrap"><canvas baseChart [type]="'doughnut'" [data]="donutData()" [options]="donutOptions" aria-label="Message delivery chart"></canvas><div class="donut-center"><strong>{{deliveredPercent()}}%</strong><span>Delivered</span></div></div><div class="legend"><span><i class="green"></i>Delivered <b>{{summary().delivered | number}}</b></span><span><i class="indigo"></i>Pending <b>{{pending() | number}}</b></span><span><i class="red"></i>Failed <b>{{summary().failed | number}}</b></span></div>}</app-card>
    </div>
    <app-card><div class="campaign-heading"><div><h2>Recent campaigns</h2><p>Your latest campaign activity</p></div><div class="tabs" role="tablist" aria-label="Filter campaigns">@for(tab of tabs;track tab){<button role="tab" [attr.aria-selected]="activeTab()===tab" [class.selected]="activeTab()===tab" (click)="activeTab.set(tab)">{{tab}}</button>}</div></div>@if(campaignError()){<p class="widget-error" role="alert">Unable to load recent campaigns.</p>}@else{<div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Audience</th><th>Scheduled for</th><th>Sent</th><th>Status</th></tr></thead><tbody>@for(row of visibleCampaigns();track row.id){<tr><td class="campaign-name">{{row.name}}</td><td>{{row.audience}}</td><td>{{row.scheduledFor}}</td><td>{{row.sent | number}}</td><td><app-status-pill [status]="row.status" /></td></tr>}@empty{<tr><td colspan="5" class="empty">No campaigns here yet. Your campaign activity will appear here.</td></tr>}</tbody></table></div>}</app-card>
  `,
  styles:[`
    :host{display:block;color:var(--text)}.page-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:16px}.eyebrow{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:1.3px}h1{margin:0;font-size:26px;letter-spacing:-.5px}.subhead{color:var(--muted);margin:8px 0 0;font-size:12px}.search{display:flex;gap:8px;background:var(--surface);padding:5px;border-radius:999px;border:1px solid var(--border);width:min(330px,44%)}.search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);padding:0 12px;font-size:12px}.search button{border:0;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:white;cursor:pointer}.mi{font-family:'Material Symbols Rounded';font-size:18px}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.charts{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,1fr);gap:16px;margin-bottom:16px}.card-heading,.campaign-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.card-heading h2,.campaign-heading h2{font-size:15px;margin:0;font-weight:600}.card-heading p,.campaign-heading p{color:var(--muted);margin:5px 0 0;font-size:11px}.sort{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:10px}.sort select{background:var(--elevated);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:7px 9px;font-size:11px}.bar-wrap{height:210px;margin-top:20px}.bar-wrap canvas,.donut-wrap canvas{width:100%!important;height:100%!important}.donut-wrap{width:170px;height:170px;position:relative;margin:24px auto 14px}.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}.donut-center strong{font-size:25px}.donut-center span{color:var(--muted);font-size:10px;margin-top:3px}.legend{display:grid;gap:10px}.legend span{display:flex;align-items:center;color:var(--muted);font-size:10px;gap:8px}.legend b{margin-left:auto;color:var(--text);font-weight:500}.legend i{width:8px;height:8px;border-radius:50%}.green{background:var(--success)}.indigo{background:var(--accent)}.red{background:var(--danger)}.campaign-heading{margin-bottom:18px}.tabs{display:flex;padding:3px;background:var(--elevated);border-radius:9px;gap:2px}.tabs button{border:0;border-radius:7px;padding:7px 11px;color:var(--muted);background:transparent;font-size:10px;cursor:pointer}.tabs button.selected{background:#444a55;color:var(--text)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px;text-align:left}th{font-weight:500;color:var(--muted);font-size:10px;padding:0 12px 12px;border-bottom:1px solid var(--border)}td{font-size:11px;padding:14px 12px;border-bottom:1px solid var(--border);color:#c5cad2}tbody tr:last-child td{border-bottom:0}.campaign-name{font-weight:600;color:var(--text)}.empty{text-align:center;color:var(--muted);padding:35px 10px;font-size:12px}.widget-error{color:var(--danger);font-size:12px;margin:14px 0}.skeleton{height:15px;background:linear-gradient(90deg,var(--surface),var(--elevated),var(--surface));background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}@keyframes shimmer{to{background-position:-200% 0}}@media(max-width:1100px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.page-head{align-items:flex-start;flex-direction:column}.search{width:100%}.charts{grid-template-columns:1fr}.campaign-heading{align-items:flex-start;flex-direction:column}.stats{gap:10px}.stats app-stat-card{min-width:0}}
  `],
})
/**
 * Renders live owner-scoped dashboard data and keeps the campaign listener scoped to this route.
 */
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  readonly campaigns = signal<DashboardCampaign[]>([]);
  readonly campaignError = signal(false);
  readonly subscriberCount=signal<number|null>(null);
  readonly subscriberError=signal(false);
  readonly seriesError=signal(false);
  readonly series=signal<DashboardSeries>({ labels: [], messages: [] });
  readonly period=signal<ActivityPeriod>('Weekly');
  readonly activeTab=signal<CampaignTab>('All');
  readonly searchTerm=signal('');
  readonly tabs:CampaignTab[]=['All','Scheduled','Completed'];
  readonly summary=computed(()=>this.campaigns().reduce((totals,campaign)=>({
    campaignCount:totals.campaignCount+1,
    sent:totals.sent+campaign.sent,
    delivered:totals.delivered+campaign.delivered,
    read:totals.read+campaign.read,
    failed:totals.failed+campaign.failed,
  }),{campaignCount:0,sent:0,delivered:0,read:0,failed:0}));
  readonly readRate=computed(()=>this.summary().delivered===0?'—':`${Math.round(this.summary().read/this.summary().delivered*100)}%`);
  readonly pending=computed(()=>Math.max(0,this.summary().sent-this.summary().delivered-this.summary().failed));
  readonly deliveredPercent=computed(()=>{const totals=this.summary();const denominator=totals.delivered+this.pending()+totals.failed;return denominator?Math.round(totals.delivered/denominator*100):0;});
  readonly visibleCampaigns=computed(()=>this.campaigns().slice(0,10).filter(item=>{const tab=this.activeTab();const byTab=tab==='All'||(tab==='Scheduled'?item.status==='Scheduled':item.status==='Completed');const search=this.searchTerm().trim().toLowerCase();return byTab&&(!search||`${item.name} ${item.audience} ${item.status}`.toLowerCase().includes(search));}));
  readonly barOptions:ChartOptions<'bar'>={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#8b93a1',font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.06)'},border:{display:false},ticks:{color:'#8b93a1',font:{size:9},maxTicksLimit:5}}}};
  readonly donutOptions:ChartOptions<'doughnut'>={responsive:true,maintainAspectRatio:false,cutout:'78%',plugins:{legend:{display:false},tooltip:{enabled:true}}};
  readonly donutData=computed<ChartData<'doughnut'>>(()=>({labels:['Delivered','Pending','Failed'],datasets:[{data:[this.summary().delivered,this.pending(),this.summary().failed],backgroundColor:['#5fcf80','#5b63f5','#e5646e'],borderWidth:0,hoverOffset:3}]}));
  readonly barData=computed<ChartData<'bar'>>(()=>{const values=this.series().messages;return{labels:this.series().labels,datasets:[{data:values,backgroundColor:values.map((_,index)=>index===values.length-1?'#5b63f5':'#454c58'),borderRadius:6,borderSkipped:false,maxBarThickness:28}]};});

  /**
   * Starts independent widget reads and the sole real-time campaigns listener.
   */
  constructor(){
    const unsubscribe = this.dashboard.watchCampaigns(
      campaigns => { this.campaigns.set(campaigns); this.campaignError.set(false); },
      error => { console.error('Dashboard campaigns widget failed', this.errorCode(error)); this.campaignError.set(true); },
    );
    this.destroyRef.onDestroy(unsubscribe);
    void this.loadSubscribers();
    void this.loadSeries();
  }

  /**
   * Updates the selected chart range and performs one bounded-range stats read.
   * @param event The select control change event.
   */
  setPeriod(event:Event):void{this.period.set((event.target as HTMLSelectElement).value as ActivityPeriod);void this.loadSeries();}

  /**
   * Loads the signed-in user's subscriber count without downloading subscriber documents.
   */
  private async loadSubscribers():Promise<void>{
    try { this.subscriberCount.set(await this.dashboard.getSubscriberCount()); }
    catch(error) { console.error('Dashboard subscribers widget failed',this.errorCode(error));this.subscriberError.set(true); }
  }

  /**
   * Loads and aggregates stats for the selected chart period without a live listener.
   */
  private async loadSeries():Promise<void>{
    try { this.series.set(await this.dashboard.getMessageSeries(this.period()));this.seriesError.set(false); }
    catch(error) { console.error('Dashboard statistics widget failed',this.errorCode(error));this.seriesError.set(true); }
  }

  /**
   * Extracts only a Firestore error code so logs never contain tokens or personal data.
   * @param error The caught error value.
   * @returns The error code, if the value exposes one.
   */
  private errorCode(error:unknown):string|undefined{
    if(typeof error==='object'&&error!==null&&'code'in error&&typeof error.code==='string')return error.code;
    return undefined;
  }
}

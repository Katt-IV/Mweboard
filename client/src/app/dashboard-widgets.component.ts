// Shared dashboard presentation widgets; all displayed values are supplied by their parent views.
import { Component, computed, input, signal } from '@angular/core';

@Component({ selector:'app-card', standalone:true, template:`<section class="card"><ng-content /></section>`, styles:[`:host{display:block;min-width:0}.card{height:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:20px;box-shadow:0 8px 24px #00000012;transition:transform 150ms,box-shadow 150ms}.card:hover{box-shadow:0 12px 28px #00000022}`] })
export class CardComponent {}

@Component({ selector:'app-stat-card', standalone:true, template:`<article class="stat" [class]="'stat '+tone()"><div class="badge"><span class="mi">{{icon()}}</span></div><div class="label">{{label()}}</div>@if(hint()==='Loading'){<div class="value skeleton" aria-label="Loading"></div>}@else{<div class="value">{{value()}}</div>}@if(error()){<div class="error" role="alert">{{error()}}</div>}<div class="hint">{{hint()}}</div></article>`, styles:[`:host{display:block}.stat{position:relative;overflow:hidden;min-height:145px;padding:18px 20px;border-radius:16px;color:white;transition:transform 150ms,filter 150ms}.stat:hover{transform:translateY(-2px);filter:brightness(1.06)}.purple{background:var(--tint-purple)}.rose{background:var(--tint-rose)}.blue{background:var(--tint-blue)}.tan{background:var(--tint-tan)}.badge{width:38px;height:38px;display:grid;place-items:center;background:#ffffff24;clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}.mi{font-family:'Material Symbols Rounded';font-size:19px}.label{margin-top:13px;font-size:12px;color:#ffffffcf}.value{font-size:27px;font-weight:700;letter-spacing:-.6px;margin-top:3px}.skeleton{width:82px;height:29px;border-radius:6px;background:linear-gradient(90deg,#ffffff1c,#ffffff3a,#ffffff1c);background-size:200% 100%;animation:shimmer 1.2s infinite}.hint{position:absolute;right:18px;bottom:22px;color:#ffffffaa;font-size:10px}.error{font-size:10px;color:#ffe4e5;margin-top:4px}@keyframes shimmer{to{background-position:-200% 0}}`] })
export class StatCardComponent { label=input.required<string>(); value=input.required<string>(); icon=input.required<string>(); tone=input('purple'); hint=input('This month'); error=input(''); }

@Component({ selector:'app-status-pill', standalone:true, template:`<span class="pill" [class]="'pill '+status().toLowerCase()">{{status()}}</span>`, styles:[`:host{display:inline-flex}.pill{padding:5px 10px;border-radius:999px;font-size:10px;font-weight:600;white-space:nowrap}.delivered,.completed,.read{background:var(--success-bg);color:var(--success)}.failed{background:var(--danger-bg);color:var(--danger)}.scheduled,.pending,.sent{background:var(--pending-bg);color:var(--pending)}`] })
export class StatusPillComponent { status=input.required<string>(); }

@Component({ selector:'app-calendar-widget', standalone:true, template:`<section class="rail-card calendar"><div class="rail-title"><span>{{monthLabel()}}</span><div><button aria-label="Previous month" (click)="move(-1)">‹</button><button aria-label="Next month" (click)="move(1)">›</button></div></div><div class="weekdays">@for (d of weekdays; track $index) { <span>{{d}}</span> }</div><div class="days">@for (d of days(); track $index) { <span [class.scheduled]="isScheduled(d)" [class.today]="d===today()" [class.empty]="!d">{{d || ''}}</span> }</div><p class="calendar-note"><i></i> Scheduled campaign</p></section>`, styles:[`.rail-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px}.rail-title{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:14px}.rail-title div{display:flex;gap:4px}.rail-title button{width:25px;height:25px;border:0;border-radius:7px;background:var(--elevated);color:var(--muted);font-size:19px;line-height:1;cursor:pointer}.rail-title button:hover{color:var(--text)}.weekdays,.days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:5px}.weekdays{margin-top:18px;color:var(--muted);font-size:10px}.days{margin-top:10px}.days span{height:28px;display:grid;place-items:center;font-size:11px;border-radius:50%}.days .empty{opacity:0}.days .scheduled{background:#34385f;color:#aab0ff}.days .today{background:var(--accent);color:white}.calendar-note{font-size:10px;color:var(--muted);display:flex;align-items:center;gap:7px;margin:14px 0 0}.calendar-note i{width:7px;height:7px;border-radius:50%;background:var(--accent)}`] })
export class CalendarWidgetComponent {
  scheduledDates=input<readonly string[]>([]);
  readonly weekdays=['M','T','W','T','F','S','S'];
  private readonly offset=signal(0);
  private readonly month= computed(()=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth()+this.offset(),1);});
  readonly monthLabel=computed(()=>new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(this.month()));
  readonly today=computed(()=>{const now=new Date();return now.getFullYear()===this.month().getFullYear()&&now.getMonth()===this.month().getMonth()?now.getDate():-1;});
  readonly days=computed(()=>{const month=this.month();const leading=(month.getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();return [...Array(leading).fill(null),...Array.from({length:count},(_,i)=>i+1)];});
  /**
   * Checks whether a calendar day matches one of the supplied scheduled campaign dates.
   * @param day The displayed calendar day, or null for a leading blank cell.
   * @returns Whether this day has a scheduled campaign.
   */
  isScheduled(day:number|null):boolean { if (!day) return false; return this.scheduledDates().some(raw=>{const date=new Date(`${raw}T00:00:00`);const month=this.month();return date.getFullYear()===month.getFullYear()&&date.getMonth()===month.getMonth()&&date.getDate()===day;}); }

  /**
   * Moves the calendar by the requested number of months.
   * @param direction The signed month offset to apply.
   * @returns Nothing; the reactive month offset is updated.
   */
  move(direction:number){this.offset.update(value=>value+direction);}
}

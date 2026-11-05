import { I as EventEmitter, U as InjectionToken, et as NgZone, la as ɵɵdefineInjectable, rt as PLATFORM_ID, wr as inject } from "./_resource-chunk-_hotzT1w.js";
import { Ai as setClassMetadata, Sn as Input, Wa as ɵɵdefineDirective, Yi as ɵɵNgOnChangesFeature, fn as ElementRef, un as Directive, xn as Injectable, zn as Output } from "./core-DdaWCEkT.js";
import { Zn as BehaviorSubject, gt as distinctUntilChanged } from "./esm5-Doa4YBQt.js";
import { u as isPlatformBrowser } from "./common-D26v61UA.js";
import { U as registerables, q as defaults, u as Chart } from "./chart-DbjNqWb6.js";
// node_modules/es-toolkit/dist/predicate/isPlainObject.mjs
/**
* Checks if a given value is a plain object.
*
* @param value - The value to check.
* @returns True if the value is a plain object, otherwise false.
*
* @example
* ```typescript
* // ✅👇 True
*
* isPlainObject({ });                       // ✅
* isPlainObject({ key: 'value' });          // ✅
* isPlainObject({ key: new Date() });       // ✅
* isPlainObject(new Object());              // ✅
* isPlainObject(Object.create(null));       // ✅
* isPlainObject({ nested: { key: true} });  // ✅
* isPlainObject(new Proxy({}, {}));         // ✅
* isPlainObject({ [Symbol('tag')]: 'A' });  // ✅
*
* // ✅👇 (cross-realms, node context, workers, ...)
* const runInNewContext = await import('node:vm').then(
*     (mod) => mod.runInNewContext
* );
* isPlainObject(runInNewContext('({})'));   // ✅
*
* // ❌👇 False
*
* class Test { };
* isPlainObject(new Test())           // ❌
* isPlainObject(10);                  // ❌
* isPlainObject(null);                // ❌
* isPlainObject('hello');             // ❌
* isPlainObject([]);                  // ❌
* isPlainObject(new Date());          // ❌
* isPlainObject(new Uint8Array([1])); // ❌
* isPlainObject(Buffer.from('ABC'));  // ❌
* isPlainObject(Promise.resolve({})); // ❌
* isPlainObject(Object.create({}));   // ❌
* isPlainObject(new (class Cls {}));  // ❌
* isPlainObject(globalThis);          // ❌,
* ```
*/
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	if (!(proto === null || proto === Object.prototype || Object.getPrototypeOf(proto) === null)) return false;
	return Object.prototype.toString.call(value) === "[object Object]";
}
// node_modules/es-toolkit/dist/_internal/isMergeableValue.mjs
/**
* Checks if a value can be deeply merged into, i.e. it is a plain object or an array.
*
* This function is used in `merge`, `mergeWith`, and `toMerged` to decide whether
* the source value should be merged into the existing target value recursively,
* preserving the target's structure, instead of replacing it.
*
* @param value - The value to check.
* @returns `true` if the value is a plain object or an array, otherwise `false`.
*/
function isMergeableValue(value) {
	return isPlainObject(value) || Array.isArray(value);
}
// node_modules/es-toolkit/dist/_internal/isUnsafeProperty.mjs
/**
* Checks if a property key is unsafe to access or copy directly.
*
* This function is used in functions like `get` and `merge` to prevent
* prototype pollution attacks by identifying `__proto__`, which modifies the object's
* prototype chain. `constructor` and `prototype` stay accessible here because lodash
* keeps reads of them unrestricted; write paths use `isUnsafeToWriteProperty` instead,
* which also blocks those keys.
*
* @param key - The property key to check
* @returns `true` if the property is unsafe to access directly, `false` otherwise
* @internal
*/
function isUnsafeProperty(key) {
	return key === "__proto__";
}
// node_modules/es-toolkit/dist/object/merge.mjs
function merge(target, source) {
	const sourceKeys = Object.keys(source);
	for (let i = 0; i < sourceKeys.length; i++) {
		const key = sourceKeys[i];
		if (isUnsafeProperty(key)) continue;
		const sourceValue = source[key];
		const targetValue = target[key];
		if (isMergeableValue(sourceValue) && isMergeableValue(targetValue)) target[key] = merge(targetValue, sourceValue);
		else if (Array.isArray(sourceValue)) target[key] = merge([], sourceValue);
		else if (isPlainObject(sourceValue)) target[key] = merge({}, sourceValue);
		else if (targetValue === void 0 || sourceValue !== void 0) target[key] = sourceValue;
	}
	return target;
}
// node_modules/ng2-charts/fesm2022/ng2-charts.mjs
var NG_CHARTS_CONFIGURATION = new InjectionToken("Configuration for ngCharts");
/**
* Provide all the default registerable as defined by Chart.js
*/
function withDefaultRegisterables(...registerables$1) {
	return { registerables: [...registerables, ...registerables$1] };
}
/**
* Provide configuration for ngCharts. In most cases, you have to pass it some registerables. So either
* `withDefaultRegisterables()`, or a custom list of registerables tailored to your needs to reduce bundle size.
*/
function provideCharts(...configurations) {
	return {
		provide: NG_CHARTS_CONFIGURATION,
		useValue: configurations.reduce(merge, {})
	};
}
var ThemeService = class ThemeService {
	constructor() {
		this.colorschemesOptions = new BehaviorSubject(void 0);
	}
	setColorschemesOptions(options) {
		this.pColorschemesOptions = options;
		this.colorschemesOptions.next(options);
	}
	getColorschemesOptions() {
		return this.pColorschemesOptions;
	}
	static {
		this.ɵfac = function ThemeService_Factory(__ngFactoryType__) {
			return new (__ngFactoryType__ || ThemeService)();
		};
	}
	static {
		this.ɵprov = /*@__PURE__*/ ɵɵdefineInjectable({
			token: ThemeService,
			factory: ThemeService.ɵfac,
			providedIn: "root"
		});
	}
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ThemeService, [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}], null, null);
})();
var BaseChartDirective = class BaseChartDirective {
	constructor() {
		this.type = "bar";
		this.plugins = [];
		this.chartClick = new EventEmitter();
		this.chartHover = new EventEmitter();
		this.ctx = null;
		this.subs = [];
		this.themeOverrides = {};
		this.element = inject(ElementRef);
		this.zone = inject(NgZone);
		this.themeService = inject(ThemeService);
		this.config = inject(NG_CHARTS_CONFIGURATION, { optional: true });
		this.platformId = inject(PLATFORM_ID);
		this.isBrowser = isPlatformBrowser(this.platformId);
		if (this.config?.registerables) Chart.register(...this.config.registerables);
		if (this.config?.defaults) defaults.set(this.config.defaults);
		if (this.isBrowser) this.ctx = this.element.nativeElement.getContext("2d");
		this.subs.push(this.themeService.colorschemesOptions.pipe(distinctUntilChanged()).subscribe((r) => this.themeChanged(r)));
	}
	ngOnChanges(changes) {
		if (!this.isBrowser) return;
		const requireRender = ["type"];
		const propertyNames = Object.getOwnPropertyNames(changes);
		if (propertyNames.some((key) => requireRender.includes(key)) || propertyNames.every((key) => changes[key].isFirstChange())) this.render();
		else if (this.chart && changes["legend"]) {
			const config = this.getChartConfiguration();
			if (config.options) this.chart.options = config.options;
			this.update();
		} else if (this.chart) {
			const config = this.getChartConfiguration();
			if (config.data && this.chart.config.data) Object.assign(this.chart.config.data, config.data);
			if (config.plugins && this.chart.config.plugins) Object.assign(this.chart.config.plugins, config.plugins);
			if (config.options && this.chart.config.options) Object.assign(this.chart.config.options, config.options);
			this.update();
		}
	}
	ngOnDestroy() {
		if (this.chart) {
			this.chart.destroy();
			this.chart = void 0;
		}
		this.subs.forEach((s) => s.unsubscribe());
	}
	render() {
		if (!this.isBrowser || !this.ctx) return;
		if (this.chart) this.chart.destroy();
		return this.zone.runOutsideAngular(() => this.chart = new Chart(this.ctx, this.getChartConfiguration()));
	}
	update(mode) {
		if (this.chart && this.isBrowser) this.zone.runOutsideAngular(() => this.chart?.update(mode));
	}
	hideDataset(index, hidden) {
		if (this.chart && this.isBrowser) {
			this.chart.getDatasetMeta(index).hidden = hidden;
			this.update();
		}
	}
	isDatasetHidden(index) {
		return this.chart?.getDatasetMeta(index)?.hidden;
	}
	toBase64Image() {
		return this.chart?.toBase64Image();
	}
	themeChanged(options) {
		this.themeOverrides = options;
		if (this.chart) {
			if (this.chart.config.options) Object.assign(this.chart.config.options, this.getChartOptions());
			this.update();
		}
	}
	getChartOptions() {
		return [
			{
				onHover: (event, active) => {
					if (!this.chartHover.observed && !this.chartHover.observers?.length) return;
					this.zone.run(() => this.chartHover.emit({
						event,
						active
					}));
				},
				onClick: (event, active) => {
					if (!this.chartClick.observed && !this.chartClick.observers?.length) return;
					this.zone.run(() => this.chartClick.emit({
						event,
						active
					}));
				}
			},
			this.themeOverrides ?? {},
			this.options ?? {},
			{ plugins: { legend: { display: this.legend } } }
		].reduce(merge, {});
	}
	getChartConfiguration() {
		return {
			type: this.type,
			data: this.getChartData(),
			options: this.getChartOptions(),
			plugins: this.plugins
		};
	}
	getChartData() {
		return this.data ? this.data : {
			labels: this.labels || [],
			datasets: this.datasets || []
		};
	}
	static {
		this.ɵfac = function BaseChartDirective_Factory(__ngFactoryType__) {
			return new (__ngFactoryType__ || BaseChartDirective)();
		};
	}
	static {
		this.ɵdir = /*@__PURE__*/ ɵɵdefineDirective({
			type: BaseChartDirective,
			selectors: [[
				"canvas",
				"baseChart",
				""
			]],
			inputs: {
				type: "type",
				legend: "legend",
				data: "data",
				options: "options",
				plugins: "plugins",
				labels: "labels",
				datasets: "datasets"
			},
			outputs: {
				chartClick: "chartClick",
				chartHover: "chartHover"
			},
			exportAs: ["base-chart"],
			features: [ɵɵNgOnChangesFeature]
		});
	}
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(BaseChartDirective, [{
		type: Directive,
		args: [{
			selector: "canvas[baseChart]",
			exportAs: "base-chart",
			standalone: true
		}]
	}], () => [], {
		type: [{ type: Input }],
		legend: [{ type: Input }],
		data: [{ type: Input }],
		options: [{ type: Input }],
		plugins: [{ type: Input }],
		labels: [{ type: Input }],
		datasets: [{ type: Input }],
		chartClick: [{ type: Output }],
		chartHover: [{ type: Output }]
	});
})();
export { BaseChartDirective, NG_CHARTS_CONFIGURATION, ThemeService, provideCharts, withDefaultRegisterables };

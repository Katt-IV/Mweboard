import { ua as ɵɵdefineInjector } from "./_resource-chunk-_hotzT1w.js";
import { Ai as setClassMetadata, Ga as ɵɵdefineNgModule, Nn as NgModule } from "./core-DdaWCEkT.js";
import { t as BidiModule } from "./bidi-1Hd2lX6L.js";
import { r as MatRipple } from "./_structural-styles-chunk-CqT0cINj.js";
// node_modules/@angular/material/fesm2022/_ripple-module-chunk.mjs
var MatRippleModule = class MatRippleModule {
	static ɵfac = function MatRippleModule_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || MatRippleModule)();
	};
	static ɵmod = /*@__PURE__*/ ɵɵdefineNgModule({
		type: MatRippleModule,
		imports: [MatRipple],
		exports: [MatRipple, BidiModule]
	});
	static ɵinj = /*@__PURE__*/ ɵɵdefineInjector({ imports: [BidiModule] });
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(MatRippleModule, [{
		type: NgModule,
		args: [{
			imports: [MatRipple],
			exports: [MatRipple, BidiModule]
		}]
	}], null, null);
})();
export { MatRippleModule as t };

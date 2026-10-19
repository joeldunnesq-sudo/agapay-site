import { readFileSync, writeFileSync } from 'node:fs';
const edit = (p,f) => writeFileSync(p,f(readFileSync(p,'utf8')));
edit('src/browser/admin/presentation.ts', s => {
 const types = `// Stored optional fields remain loose; existing rendering performs normalization.
interface AdminPresentationRegistration {
  readonly stripeRequirementsDue?: unknown;
  readonly stripeDisabledReason?: unknown;
  readonly stripeAccountId?: unknown;
  readonly subscriptionTierLabel?: string | null;
  readonly subscriptionTier?: string | null;
  readonly receivedAt?: string | number | Date | null;
  readonly status?: string | null;
  readonly stripeAccountStatus?: string | null;
}
type PresentationDate = string | number | Date | null | undefined;
interface AdminPlatformSummary {
  year: number;
  totalRegistered: number;
  totalVerified: number;
  connectedStripeAccounts: number;
  ytdDonationsCents: number;
  giftCount: number;
  donationDataSource: string;
  monthly: { month: number; label: string; registered: number; verified: number; ytdDonationsCents: number; giftCount: number }[];
}
interface AdminPresentationGlobals {
  formatClock(value: PresentationDate): string;
  escapeHtml(value: unknown): string;
  escapeAttr(value: unknown): string;
  jsString(value: unknown): string;
  jsAttr(value: unknown): string;
  field(label: unknown, value: unknown, className?: string): string;
  readableStripeRequirement(value: unknown): string;
  renderStripeRequirements(reg: AdminPresentationRegistration): string;
  money(cents: unknown): string;
  moneyShort(cents: unknown): string;
  monthLabel(index: number): string;
  readable(value: unknown): string;
  shortDate(value: PresentationDate): string;
  subscriptionTierLabel(reg: AdminPresentationRegistration): string;
  transactionFeeLabel(reg: unknown): string;
  jsonForTextarea(value: { readonly length?: number } | null | undefined, fallback: unknown): string;
  computeLocalPlatformSummary(registrations: readonly AdminPresentationRegistration[]): AdminPlatformSummary;
}

`;
 s = s.replace('installAdminPresentation(global)', 'installAdminPresentation(global: typeof globalThis)');
 for(const name of ['escapeHtml','escapeAttr','jsString','jsAttr','readableStripeRequirement','readable']) s=s.replace(`function ${name}(value)`, `function ${name}(value: unknown)`);
 for(const name of ['formatClock','shortDate']) s=s.replace(`function ${name}(value)`, `function ${name}(value: PresentationDate)`);
 for(const name of ['money','moneyShort']) s=s.replace(`function ${name}(cents)`, `function ${name}(cents: unknown)`);
 for(const name of ['renderStripeRequirements','subscriptionTierLabel']) s=s.replace(`function ${name}(reg)`, `function ${name}(reg: AdminPresentationRegistration)`);
 s=s.replace("function field(label, value, className = '')", "function field(label: unknown, value: unknown, className = '')");
 s=s.replace('function monthLabel(index)', 'function monthLabel(index: number)');
 s=s.replace('function transactionFeeLabel(reg)', 'function transactionFeeLabel(_reg: unknown)');
 s=s.replace('function jsonForTextarea(value, fallback)', 'function jsonForTextarea(value: { readonly length?: number } | null | undefined, fallback: unknown)');
 s=s.replace('function computeLocalPlatformSummary(registrations)', 'function computeLocalPlatformSummary(registrations: readonly AdminPresentationRegistration[]): AdminPlatformSummary');
 // Array.includes accepts a string, but missing stored status is deliberately false at runtime.
 s=s.replace("['charges_enabled', 'payouts_enabled'].includes(item.stripeAccountStatus)", "(['charges_enabled', 'payouts_enabled'] as readonly unknown[]).includes(item.stripeAccountStatus)");
 s=s.replace('  });\n})(globalThis);','  } satisfies AdminPresentationGlobals);\n})(globalThis);').replace('  });\r\n})(globalThis);','  } satisfies AdminPresentationGlobals);\r\n})(globalThis);');
 return types+s;
});
edit('src/browser/donor/bookstore-presentation.ts',s=>s.replace('const BOOKSTORE_CATEGORY_LABELS =','const BOOKSTORE_CATEGORY_LABELS =').replace('};','} as const;').replace(/};(?=\r?\n\r?\nfunction)/,'} as const;').replace('formatCentsAsDollars(cents)','formatCentsAsDollars(cents: unknown): string'));
edit('package.json',s=>{
 const p=JSON.parse(s);
 p.scripts['build:browser']='node scripts/build-browser-typescript.mjs';
 p.scripts['build:browser:check']='node scripts/build-browser-typescript.mjs --check';
 for(const k of ['predev','prestart']) p.scripts[k]=p.scripts[k].replace(' && npm run assets:version',' && npm run build:browser && npm run assets:version');
 p.scripts.quality=p.scripts.quality.replace('npm run build:server:check &&','npm run build:server:check && npm run build:browser:check &&');
 for(const k of ['format','format:check']) p.scripts[k]+=' tsconfig.browser.json src/browser scripts/typecheck-browser scripts/build-browser-typescript.mjs scripts/lib/browser-typescript.mjs scripts/browser-typescript-tests.mjs public/donor/bookstore-presentation.js';
 return JSON.stringify(p,null,2)+'\n';
});
edit('wrangler.toml',s=>s.replace('node scripts/build-server-typescript.mjs --check && node scripts/version-app-assets.mjs','node scripts/build-server-typescript.mjs --check && node scripts/build-browser-typescript.mjs --check && node scripts/version-app-assets.mjs'));
edit('scripts/lib/app-asset-versions.mjs',s=>s.replace('export const appAssets',"// Admin assets use content versions too, while retaining their network-only SW policy.\nexport const pageAssets = Object.freeze(['/admin/presentation.js']);\n\nexport const appAssets").replace('appAssets.includes(asset)', '[...appAssets, ...pageAssets].includes(asset)'));
edit('scripts/version-app-assets.mjs',s=>s.replace('appAssets, appAssetUrl','appAssets, pageAssets, appAssetUrl').replace('appAssets.map(', '[...appAssets, ...pageAssets].map('));
edit('scripts/admin-presentation-extraction-tests.mjs',s=>s.replace("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport { appAssetUrl } from './lib/app-asset-versions.mjs';").replace('assert.match(html, /\\/admin\\/presentation\\.js\\?v=20260904-refactor1/);', "assert.ok(html.includes(appAssetUrl('/admin/presentation.js')));") );

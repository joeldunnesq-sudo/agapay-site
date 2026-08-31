// Starts an isolated, loopback-only preview of the real dashboard and handlers.
// Every record is synthetic, writes stay in memory, Stripe is replaced by a strict mock.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';
import { handleParishGivingHistory } from '../src/handlers/parish-giving-reports.js';
import { fundReportPeriod, loadFundGiftActivity } from '../src/lib/fund-reporting.js';

const fixture = await createOutsideGiftsFixture();
fixture.installStripeMock();
const week = fundReportPeriod({ week: true, timezone: fixture.registration.timezone });
fixture.registration.funds.forEach((fund, index) =>
  fixture.addOffering({
    id: 'weekly_' + index,
    parishId: fixture.registration.parishId,
    stripePaymentIntentId: 'pi_weekly_' + index,
    fundId: fund.id,
    fund: fund.name,
    donorName: 'Sample giver',
    donorEmail: 'preview@example.test',
    createdAt: week.startIso,
    paidAt: week.startIso,
    amountCents: [225000, 75000, 25000, 18000, 12000][index],
    stripeFeeCents: [6555, 2205, 755, 552, 378][index],
    stripeFeeSource: 'balance_transaction',
  })
);
const root = resolve('public');
const port = Number(process.env.RECONCILIATION_PREVIEW_PORT || 4176);
const origin = 'http://127.0.0.1:' + port;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== '127.0.0.1:' + port || (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url, origin);
  const json = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.headers.authorization !== 'Bearer ' + fixture.token)
        return json({ error: 'Local preview session required.' }, 401);
      const base = '/api/parish/dashboard/synthetic-parish';
      const suffix = url.pathname.slice(base.length);
      if (url.pathname === base) return json({ parish: fixture.dashboard() });
      if (suffix === '/outside-gifts' || suffix.startsWith('/outside-gifts/')) {
        let body='';for await(const chunk of req) { body+=chunk; if(body.length>16384) return json({error:'Request too large'},413); }
        const response=await fixture.outside(suffix.slice('/outside-gifts'.length)+url.search,body?JSON.parse(body):undefined);
        return json(await response.json(),response.status);
      }
      if (suffix === '/reconciliation') {
        const response = await fixture.report(url.searchParams.get('month') || fixture.month);
        return json(await response.json(), response.status);
      }
      if (suffix === '/reconciliation/close' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 32000) return json({ error: 'Preview request too large.' }, 413);
        }
        const response = await fixture.close(JSON.parse(body));
        return json(await response.json(), response.status);
      }
      if (suffix === '/giving-summary') {
        if (url.searchParams.get('view') === 'weekly-funds')
          return json({
            weeklyFunds: await loadFundGiftActivity(
              fixture.env,
              fixture.registration.parishId,
              week,
              fixture.registration
            ),
          });
        return json({
          summary: {
            year: new Date().getFullYear(),
            ytdCents: 1637409,
            grossGiftCents: 1684000,
            giftCount: 25,
            averageGiftCents: 65496,
            giverCount: 6,
            lastGiftAt: week.startIso,
          },
        });
      }
      if (suffix === '/giving-history') {
        const response=await handleParishGivingHistory(new Request(origin+req.url,{headers:{Authorization:'Bearer '+fixture.token}}),fixture.env,fixture.registration.parishId);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      if (suffix === '/recurring-health') return json({ health: { activeCount: 8, monthlyRecurringCents: 240000 } });
      if (suffix === '/stripe-volume') return json({ volume: { connected: false } });
      const background = [
        '/tax-exemption',
        '/commemorations',
        '/nonprofit-pricing',
        '/stripe-refresh',
        '/subscription-refresh',
        '/giving-statements/jobs',
        '/stewardship/nudge',
        '/settlement-profiles',
      ];
      if (background.includes(suffix)) return json({ entries: [], jobs: [], profiles: [] });
      return json({ error: 'This action is outside the local reconciliation preview.' }, 404);
    }
    const requested = ['/', '/parish/dashboard'].includes(url.pathname)
      ? '/parish/dashboard.html'
      : decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + requested);
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let body = await readFile(path);
    if (requested === '/parish/dashboard.html') {
      const bootstrap =
        '<script>sessionStorage.setItem("agapay_parish_id","synthetic-parish");sessionStorage.setItem("agapay_parish_session_token",' +
        JSON.stringify(fixture.token) +
        ');</script>';
      body = body
        .toString()
        .replace('<head>', '<head>' + bootstrap)
        .replace('<body', '<body data-reconciliation-preview="true"');
      body = body.replace(
        /(<body\b[^>]*>)/,
        '$1<aside style="padding:7px 12px;text-align:center;background:#061522;color:#f3deac;font:12px Arial">LOCAL PREVIEW · Synthetic parish and transactions · Saves stay in memory · Nothing is deployed</aside>'
      );
    }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    json({ error: error.message }, 500);
  }
});
server.listen(port, '127.0.0.1', () => console.log('Reconciliation preview: ' + origin + '/parish/dashboard'));
process.on('SIGINT', () =>
  server.close(() => {
    fixture.dispose();
    process.exit(0);
  })
);

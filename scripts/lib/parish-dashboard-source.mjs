import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

// Keep source assertions independent of the physical split. Load the real files
// referenced by the dashboard; boundary tests still inspect app.js on its own.
export function parishDashboardFeaturePaths() {
  const html = readFileSync(new URL('public/parish/dashboard.html', root), 'utf8');
  return [
    ...html.matchAll(
      /<script src="(\/parish\/features\/(?:accounting|commerce|koinonia)(?:\/[^"?]+)?\.js)\?[^\"]+"><\/script>/g
    ),
  ].map((match) => `public${match[1]}`);
}

export function readParishDashboardSource() {
  return ['public/parish/app.js', 'public/parish/dashboard-runtime.js', ...parishDashboardFeaturePaths()]
    .map((file) => readFileSync(new URL(file, root), 'utf8'))
    .join('\n');
}

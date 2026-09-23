import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const files = new Map([
  ['/giving-box.js', ['public/giving-box.js', 'text/javascript']],
  ['/give/embed/test', ['public/give/embed.html', 'text/html']],
  ['/give/embed.css', ['public/give/embed.css', 'text/css']],
  ['/give/embed.js', ['public/give/embed.js', 'text/javascript']],
]);
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'website.test') {
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><style>
      .custom { --agapay-giving-primary: #345678; --agapay-giving-background: #182028;
        --agapay-giving-surface: #283038; --agapay-giving-text: #eeeeee;
        --agapay-giving-font: Arial, sans-serif; --agapay-giving-heading-font: Georgia, serif;
        --agapay-giving-accent: #aabbcc; }
      </style><div class="custom" data-agapay-giving="test" data-preview="parish" data-loading="eager"></div>
      <div data-agapay-giving="test" data-preview="parish" data-loading="eager"></div>
      <script src="https://localhost/giving-box.js"></script>`,
    });
  }
  if (url.hostname === 'localhost' && files.has(url.pathname)) {
    const [path, contentType] = files.get(url.pathname);
    return route.fulfill({ contentType, body: await readFile(new URL(`../${path}`, import.meta.url)) });
  }
  return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
});

try {
  await page.goto('https://website.test');
  const custom = page.frameLocator('iframe').nth(0);
  const defaults = page.frameLocator('iframe').nth(1);
  await custom.locator('#continueButton').waitFor();
  await defaults.locator('#continueButton').waitFor();
  // Theme messages and CSS transitions complete asynchronously, especially in CI.
  const assertCss = async (locator, property, expected) => {
    const deadline = Date.now() + 5000;
    let actual;
    do {
      actual = await locator.evaluate((node, prop) => getComputedStyle(node)[prop], property);
      if (actual === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.equal(actual, expected, `Expected final ${property}`);
  };
  await assertCss(custom.locator('.giving-box'), 'backgroundColor', 'rgb(24, 32, 40)');
  await assertCss(custom.locator('[data-amount="50"]'), 'backgroundColor', 'rgb(52, 86, 120)');
  await assertCss(custom.locator('#continueButton'), 'backgroundColor', 'rgb(170, 187, 204)');
  await assertCss(custom.locator('#customAmount'), 'fontFamily', 'Arial, sans-serif');
  await assertCss(defaults.locator('[data-amount="50"]'), 'backgroundColor', 'rgb(7, 26, 42)');
  await custom.locator('#continueButton').click();
  await custom.locator('#firstName').waitFor();
  await assertCss(custom.locator('#firstName'), 'backgroundColor', 'rgb(40, 48, 56)');
  await assertCss(custom.locator('#detailsStepTitle'), 'fontFamily', 'Georgia, serif');
  await page.evaluate(() => {
    document.querySelector('.custom').style.setProperty('--agapay-giving-primary', '#123456');
    window.AGAPAYGivingBox.refreshTheme();
  });
  await custom.locator('#backButton').click();
  await assertCss(custom.locator('[data-amount="50"]'), 'backgroundColor', 'rgb(18, 52, 86)');
  // Invalid color values cannot introduce arbitrary CSS; unlisted properties are ignored.
  await page.evaluate(() =>
    document.querySelector('iframe').contentWindow.postMessage(
      {
        type: 'agapay:giving-box-theme',
        theme: { primary: 'red; display:none', display: 'none', font: 'url(https://bad.test/font)' },
      },
      'https://localhost'
    )
  );
  await custom.locator('#continueButton').click();
  await assertCss(custom.locator('#detailsStepTitle'), 'color', 'rgb(7, 26, 42)');
  assert.equal(await custom.locator('#donorForm').isVisible(), true);

  // Exercise the actual dashboard dialog and copied snippet without backend fixtures.
  const dashboard = await readFile(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
  assert.match(dashboard, /openGivingEmbedTheme\(\)/);
  await page.setContent('<main></main>');
  for (const file of ['style.css', 'redesign.css']) {
    await page.addStyleTag({ content: await readFile(new URL(`../public/parish/${file}`, import.meta.url), 'utf8') });
  }
  await page.evaluate(() => {
    window.dedicatedGivingEmbedUrl = () => 'https://localhost/give/embed/test?preview=parish';
    window.givingEmbedSnippet = () =>
      '<div data-agapay-giving="test"></div><script src="https://localhost/giving-box.js"></script>';
    window.setStatus = () => {};
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (value) => {
          window.copiedSnippet = value;
        },
      },
    });
  });
  await page.addScriptTag({
    content: await readFile(new URL('../public/parish/features/giving/embed-theme.js', import.meta.url), 'utf8'),
  });
  await page.evaluate(() => openGivingEmbedTheme());
  await page.frameLocator('#givingThemePreview').locator('#continueButton').waitFor();
  if (process.env.GIVING_THEME_SCREENSHOT) await page.screenshot({ path: process.env.GIVING_THEME_SCREENSHOT });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.locator('#givingThemeDialog').evaluate((node) => node.scrollWidth <= node.clientWidth),
    true,
    'Mobile editor must not overflow horizontally'
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .locator('#givingThemeCss')
    .fill('--agapay-giving-primary: #345678;\n--agapay-giving-font: Arial, sans-serif;');
  await page.getByRole('button', { name: 'Copy styled embed code' }).click();
  const snippet = await page.evaluate(() => window.copiedSnippet);
  assert.match(snippet, /\.parish-giving-embed \{/);
  assert.match(snippet, /--agapay-giving-primary: #345678/);
  assert.match(snippet, /class="parish-giving-embed" data-agapay-giving="test"/);
  await page.locator('#givingThemeCss').fill('display: none;');
  await page.getByRole('button', { name: 'Update preview' }).click();
  assert.match(await page.locator('#givingThemeStatus').textContent(), /Use only the listed/);
  assert.deepEqual(errors, []);
  console.log(
    'Giving embed theme browser tests passed: cross-origin CSS, isolated themes, form steps, refresh, validation, dashboard copy.'
  );
} finally {
  await browser.close();
}

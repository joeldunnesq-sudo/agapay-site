import { chromium } from "playwright";

const icons = {
  give: `
    <path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/>
    <path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/>
    <path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/>
    <path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/>
  `,
  today: `
    <rect x="3" y="4" width="18" height="17" rx="2"/>
    <path d="M8 2v4M16 2v4M3 10h18"/>
    <circle cx="12" cy="15.5" r="1.7" fill="#d4af61" stroke="none"/>
  `,
  bookstore: `
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  `,
  directory: `
    <path d="M12 3l8 6v12H4V9z"/>
    <path d="M9 21v-7h6v7M8 10h8M12 6v8"/>
  `
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 96, height: 96 } });

for (const [name, artwork] of Object.entries(icons)) {
  await page.setContent(`
    <style>html,body{margin:0;width:96px;height:96px;overflow:hidden;background:transparent}</style>
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="20" fill="#061522"/>
      <g transform="translate(20 20) scale(2.333333)" fill="none" stroke="#d4af61"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        ${artwork}
      </g>
    </svg>
  `);
  await page.screenshot({
    path: `public/images/app/shortcuts/${name}-v2.png`,
    omitBackground: true
  });
}

await browser.close();

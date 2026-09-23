'use strict';

/* global dedicatedGivingEmbedUrl, givingEmbedSnippet, setStatus */
/* exported openGivingEmbedTheme, previewGivingEmbedTheme, copyStyledGivingEmbed */

const givingThemeDefaults = {
  primary: '#071a2a',
  'primary-text': '#f4efe4',
  accent: '#c8a24a',
  'accent-text': '#987224',
  background: '#fffdf8',
  surface: '#ffffff',
  text: '#152534',
  muted: '#6f786f',
  border: '#e1d7c6',
  success: '#2f7650',
  danger: '#a13e36',
  font: '"DM Sans", system-ui, sans-serif',
  'heading-font': '"Cormorant Garamond", Georgia, serif',
};

function ensureGivingEmbedThemeDialog() {
  if (document.getElementById('givingThemeDialog')) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<dialog id="givingThemeDialog" aria-labelledby="givingThemeHeading" style="width:min(1000px,calc(100% - 24px));max-height:90vh;overflow:auto;border:0;border-radius:16px;padding:24px">
  <form method="dialog" style="display:flex;justify-content:space-between;align-items:center;gap:16px"><h2 id="givingThemeHeading">Customize your giving card</h2><button class="btn btn-ghost" aria-label="Close giving card customizer">Close</button></form>
  <p>Match your parish website with CSS colors and fonts. Edit the declarations, preview, then copy the styled embed code to your website. Changes are saved in the copied code.</p>
  <p>Primary colors style selected amounts; accent colors style the main button and labels. Use font stacks available on visitors’ devices, or the included DM Sans and Cormorant Garamond. Fonts loaded only by your website are not available inside the card.</p>
  <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">
    <div style="flex:1 1 320px;min-width:0"><label for="givingThemeCss">Card CSS declarations</label><textarea id="givingThemeCss" spellcheck="false" rows="16" style="display:block;width:100%;font:13px/1.6 monospace" aria-describedby="givingThemeStatus"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn btn-ghost" onclick="previewGivingEmbedTheme()">Update preview</button><button type="button" class="btn btn-gold" onclick="copyStyledGivingEmbed()">Copy styled embed code</button></div><p id="givingThemeStatus" role="status" aria-live="polite"></p></div>
    <iframe id="givingThemePreview" title="Customized giving card preview" style="flex:1 1 320px;width:100%;min-width:0;height:720px;border:0"></iframe>
  </div>
</dialog>`
  );
}

function openGivingEmbedTheme() {
  ensureGivingEmbedThemeDialog();
  if (!dedicatedGivingEmbedUrl()) return setStatus('Load a parish first.', 'error');
  const editor = document.getElementById('givingThemeCss');
  editor.value = Object.entries(givingThemeDefaults)
    .map(([key, value]) => `--agapay-giving-${key}: ${value};`)
    .join('\n');
  document.getElementById('givingThemeDialog').showModal();
  previewGivingEmbedTheme();
}

function readGivingThemeEditor() {
  const input = document.getElementById('givingThemeCss').value;
  const theme = {};
  for (const declaration of input.split(';').filter((part) => part.trim())) {
    const match = declaration.trim().match(/^--agapay-giving-([a-z-]+)\s*:\s*(.+)$/);
    if (!match || !Object.hasOwn(givingThemeDefaults, match[1])) {
      throw new Error('Use only the listed --agapay-giving- CSS declarations, without selectors or braces.');
    }
    const [, key, value] = match;
    if (
      value.length > 200 ||
      /[{}<>\\]/.test(value) ||
      /url\s*\(|var\s*\(|env\s*\(|inherit|initial|unset|revert/i.test(value) ||
      !CSS.supports(key.includes('font') ? 'font-family' : 'color', value)
    ) {
      throw new Error(`Enter a valid ${key.includes('font') ? 'font family' : 'color'} for ${key}.`);
    }
    theme[key] = value;
  }
  return theme;
}

function previewGivingEmbedTheme() {
  const status = document.getElementById('givingThemeStatus');
  try {
    const theme = readGivingThemeEditor();
    const url = new URL(dedicatedGivingEmbedUrl());
    Object.entries(theme).forEach(([key, value]) => url.searchParams.set(`theme.${key}`, value));
    document.getElementById('givingThemePreview').src = url.href;
    status.textContent = 'Preview updated. Copy the styled code when you are ready.';
    return theme;
  } catch (error) {
    status.textContent = error.message;
    return null;
  }
}

async function copyStyledGivingEmbed() {
  const theme = previewGivingEmbedTheme();
  if (!theme) return;
  const css = Object.entries(theme)
    .map(([key, value]) => `  --agapay-giving-${key}: ${value};`)
    .join('\n');
  const snippet = givingEmbedSnippet().replace('<div ', '<div class="parish-giving-embed" ');
  try {
    await navigator.clipboard.writeText(`<style>\n.parish-giving-embed {\n${css}\n}\n</style>\n${snippet}`);
    document.getElementById('givingThemeStatus').textContent =
      'Styled embed code copied. Paste it into your parish website; the styles are saved in that code.';
  } catch {
    document.getElementById('givingThemeStatus').textContent =
      'Clipboard unavailable. Allow clipboard access and try again.';
  }
}

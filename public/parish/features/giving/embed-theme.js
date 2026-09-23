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

function openGivingEmbedTheme() {
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

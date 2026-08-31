'use strict';

/* global currentParish, dedicatedGivingUrl, qrcode, setStatus, downloadBlob, escapeHtml */
/* exported copyGivingLink, downloadQrSvg, downloadQrPng, downloadBulletinSvg, downloadBulletinPng */

// Giving sharing; read shared identity and catalog state only when actions run.
let currentQrSvg = '';

function qrFilename(ext) {
  return `${currentParish?.parishId || 'agapay-parish'}-giving-qr.${ext}`;
}

// ── QR CODE ───────────────────────────────────────────────
// The AGAPAY mark embedded in the QR code needs to be a self-contained
// data URI, not a /mark.png path reference. Live in the DOM, a path
// reference resolves fine — but downloadQrPng() rasterizes the SVG via
// an off-document Image()/canvas, and browsers refuse to load external
// resources (or silently taint the canvas) for a detached, blob-sourced
// SVG. Converting the logo to a data URI once and reusing it removes the
// external reference entirely, so the logo survives the PNG export too.
let markDataUriPromise = null;

function markDataUri() {
  if (markDataUriPromise) return markDataUriPromise;
  markDataUriPromise = fetch('/mark.png')
    .then((res) => res.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => {
      markDataUriPromise = null;
      return '';
    }); // allow retry on failure
  return markDataUriPromise;
}

async function renderQrCode() {
  const targets = ['qrCode', 'qrCodeHero', 'qrCodeHeroPreview', 'bulletinQrCode']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const inputs = ['givingUrlInput', 'givingUrlHeroInput', 'qrGivingUrlInput']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const url = dedicatedGivingUrl();
  inputs.forEach((inp) => {
    inp.value = url;
  });
  if (!url || typeof qrcode === 'undefined') {
    targets.forEach((t) => {
      t.innerHTML =
        '<span style="font-size:11px;color:var(--stone);text-align:center;line-height:1.5;">Load dashboard<br>to generate QR</span>';
    });
    currentQrSvg = '';
    return;
  }
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const rawSvg = qr
    .createSvgTag(5, 3)
    .replace(/<svg /, '<svg role="img" aria-label="AGAPAY giving QR code" ')
    .replace(/fill="#000000"/g, 'fill="#061522"');
  currentQrSvg = brandQrSvg(rawSvg, '');
  targets.forEach((t) => {
    t.innerHTML = currentQrSvg;
  });
  const logoHref = await markDataUri();
  if (logoHref) {
    currentQrSvg = brandQrSvg(rawSvg, logoHref);
    targets.forEach((t) => {
      t.innerHTML = currentQrSvg;
    });
  }
}

function brandQrSvg(svg, logoHref) {
  const badge = `
      <g class="agapay-qr-badge" aria-hidden="true">
        <circle cx="50%" cy="50%" r="10.5%" fill="#FFFDF9" stroke="#C8A24A" stroke-width="1.4"/>
        ${logoHref ? `<image href="${logoHref}" x="41.5%" y="41.5%" width="17%" height="17%" preserveAspectRatio="xMidYMid meet"/>` : ''}
      </g>`;
  return svg.replace('</svg>', `${badge}</svg>`);
}

async function copyGivingLink() {
  const url = dedicatedGivingUrl();
  if (!url) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  await navigator.clipboard.writeText(url);
  setStatus('Giving page link copied.', 'success');
}

// A previously-rendered currentQrSvg can exist without the logo baked in —
// e.g. the very first render happened before markDataUri() resolved, or a
// transient fetch failure produced a logo-less badge that then got cached
// as "the" QR code. Checking truthiness alone isn't enough; re-render
// whenever the logo image isn't actually present in the markup.
function qrHasLogo() {
  return currentQrSvg.includes('<image ');
}

async function downloadQrSvg() {
  if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
  if (!currentQrSvg) {
    setStatus('QR code not ready yet.', 'error');
    return;
  }
  const svg = currentQrSvg.includes('xmlns=')
    ? currentQrSvg
    : currentQrSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  downloadBlob(qrFilename('svg'), new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  setStatus(
    qrHasLogo() ? 'QR code SVG downloaded.' : 'QR code SVG downloaded — logo could not be loaded, try again.',
    qrHasLogo() ? 'success' : 'error'
  );
}

async function downloadQrPng() {
  if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
  if (!currentQrSvg) {
    setStatus('QR code not ready yet.', 'error');
    return;
  }
  const svg = currentQrSvg.includes('xmlns=')
    ? currentQrSvg
    : currentQrSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const img = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1200, 1200);
    ctx.drawImage(img, 0, 0, 1200, 1200);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('Unable to create PNG.', 'error');
        return;
      }
      downloadBlob(qrFilename('png'), blob);
      setStatus(
        qrHasLogo() ? 'QR code PNG downloaded.' : 'QR code PNG downloaded — logo could not be loaded, try again.',
        qrHasLogo() ? 'success' : 'error'
      );
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    setStatus('Unable to render QR code PNG.', 'error');
  };
  img.src = svgUrl;
}

// ── BULLETIN INSERT ───────────────────────────────────────
function bulletinDisplayUrl() {
  return (dedicatedGivingUrl() || 'agapay.app/give/parish-name-city').replace(/^https?:\/\//i, '');
}

function positionBulletinQr(svg, x, y, size) {
  if (!svg)
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="#FFFFFF" stroke="#DDD6C9"/><text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="10" fill="#6F6A60">QR code</text>`;
  const opening = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!opening) return svg;
  const positioned = opening
    // qrcode-generator already sets preserveAspectRatio on its root SVG.
    // Remove every positioning attribute before adding the bulletin-specific
    // values so the nested SVG remains valid XML (duplicate attributes make
    // browsers reject the download and prevent PNG rasterization).
    .replace(/\s(?:x|y|width|height|preserveAspectRatio)=(?:"[^"]*"|'[^']*')/gi, '')
    .replace('<svg', `<svg x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"`);
  return svg.replace(opening, positioned);
}

function buildBulletinSvg() {
  const parishName = escapeHtml(currentParish?.parishName || 'Parish Name');
  const url = escapeHtml(bulletinDisplayUrl());
  const parishSize = parishName.length > 46 ? 15 : parishName.length > 34 ? 17 : 19;
  const urlSize = url.length > 54 ? 7 : url.length > 42 ? 8 : 9;
  const qrInner = positionBulletinQr(currentQrSvg, 289, 94, 96);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="840" height="560">
      <rect width="420" height="280" fill="#FBF7EE"/>
      <rect width="420" height="68" fill="#061522"/>
      <rect y="66" width="420" height="2" fill="#C8A24A"/>
      <text x="24" y="30" font-family="Georgia,serif" font-size="${parishSize}" font-weight="bold" fill="#F6F1E8">${parishName}</text>
      <text x="396" y="43" text-anchor="end" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing="1.6" fill="#E8C879">ONLINE GIVING</text>
      <text x="24" y="116" font-family="Georgia,serif" font-size="24" font-weight="bold" letter-spacing="-.2" fill="#061522">Give with gratitude.</text>
      <text x="24" y="141" font-family="Arial,sans-serif" font-size="10" fill="#6F6A60">Support the life and ministries of our parish through</text>
      <text x="24" y="156" font-family="Arial,sans-serif" font-size="10" fill="#6F6A60">simple, secure online giving.</text>
      <rect x="24" y="182" width="230" height="32" rx="16" fill="#FFFFFF" stroke="#D8C38F"/>
      <text x="139" y="202" text-anchor="middle" font-family="Arial,sans-serif" font-size="${urlSize}" font-weight="bold" fill="#061522">${url}</text>
      <rect x="278" y="84" width="118" height="144" rx="10" fill="#FFFFFF" stroke="#C8A24A"/>
      ${qrInner}
      <text x="337" y="211" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing="1.3" fill="#8B681D">SCAN TO GIVE</text>
      <line x1="24" y1="246" x2="396" y2="246" stroke="#DDD6C9"/>
      <circle cx="28" cy="261" r="3.5" fill="#C8A24A"/>
      <text x="37" y="264" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing=".7" fill="#8F887C">POWERED BY AGAPAY</text>
    </svg>`;
}

async function downloadBulletinSvg() {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
  const svg = buildBulletinSvg();
  const name = `${currentParish.parishId || 'parish'}-bulletin-insert.svg`;
  downloadBlob(name, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  setStatus('Bulletin insert SVG downloaded.', 'success');
}

async function downloadBulletinPng() {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
  const svg = buildBulletinSvg();
  const img = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1680;
    canvas.height = 1120;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFDF9';
    ctx.fillRect(0, 0, 1680, 1120);
    ctx.drawImage(img, 0, 0, 1680, 1120);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('Unable to create PNG.', 'error');
        return;
      }
      downloadBlob(`${currentParish.parishId || 'parish'}-bulletin-insert.png`, blob);
      setStatus('Bulletin insert PNG downloaded.', 'success');
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    setStatus('Unable to render bulletin PNG.', 'error');
  };
  img.src = svgUrl;
}

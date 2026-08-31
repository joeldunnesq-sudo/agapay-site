'use strict';

// Parish dashboard commerce: bookstore-checkout.
// Classic script; preserve global names used by the dashboard and inline actions.

function bookstoreGuestCheckoutUrl() {
  if (!currentParish?.parishId) return '';
  return window.location.origin + '/' + encodeURIComponent(currentParish.parishId) + '/bookstore';
}

let bookstoreGuestCheckoutQrSvg = '';

async function renderBookstoreGuestCheckout() {
  const url = bookstoreGuestCheckoutUrl();
  const input = document.getElementById('bookstoreGuestCheckoutUrl');
  const link = document.getElementById('bookstoreGuestCheckoutLink');
  const target = document.getElementById('bookstoreGuestCheckoutQr');
  if (input) input.value = url;
  if (link) link.href = url || '#';
  if (!target || !url || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const rawSvg = qr
    .createSvgTag(4, 3)
    .replace(/<svg /, '<svg role="img" aria-label="AGAPAY bookstore QR code" ')
    .replace(/fill="#000000"/g, 'fill="#061522"');
  bookstoreGuestCheckoutQrSvg = brandQrSvg(rawSvg, '');
  target.innerHTML = bookstoreGuestCheckoutQrSvg;
  const logoHref = await markDataUri();
  if (logoHref) {
    bookstoreGuestCheckoutQrSvg = brandQrSvg(rawSvg, logoHref);
    if (target.isConnected) target.innerHTML = bookstoreGuestCheckoutQrSvg;
  }
}

async function copyBookstoreGuestCheckoutLink() {
  const url = bookstoreGuestCheckoutUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('Guest bookstore link copied.', 'success');
  } catch {
    const input = document.getElementById('bookstoreGuestCheckoutUrl');
    input?.select();
    document.execCommand('copy');
    setStatus('Guest bookstore link copied.', 'success');
  }
}

function bookstoreGuestCheckoutQrFilename(extension) {
  return `${currentParish?.parishId || 'parish'}-bookstore-checkout-qr.${extension}`;
}

async function bookstoreGuestCheckoutDownloadSvg() {
  if (!bookstoreGuestCheckoutQrSvg) await renderBookstoreGuestCheckout();
  if (!bookstoreGuestCheckoutQrSvg) {
    setStatus('Bookstore QR code is not ready yet.', 'error');
    return '';
  }
  return bookstoreGuestCheckoutQrSvg.includes('xmlns=')
    ? bookstoreGuestCheckoutQrSvg
    : bookstoreGuestCheckoutQrSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

async function downloadBookstoreGuestCheckoutQrSvg() {
  const svg = await bookstoreGuestCheckoutDownloadSvg();
  if (!svg) return;
  downloadBlob(bookstoreGuestCheckoutQrFilename('svg'), new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  setStatus('Bookstore checkout QR code SVG downloaded.', 'success');
}

async function downloadBookstoreGuestCheckoutQrPng() {
  const svg = await bookstoreGuestCheckoutDownloadSvg();
  if (!svg) return;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('Unable to create the bookstore QR code PNG.', 'error');
        return;
      }
      downloadBlob(bookstoreGuestCheckoutQrFilename('png'), blob);
      setStatus('Bookstore checkout QR code PNG downloaded.', 'success');
    }, 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    setStatus('Unable to render the bookstore QR code PNG.', 'error');
  };
  image.src = svgUrl;
}

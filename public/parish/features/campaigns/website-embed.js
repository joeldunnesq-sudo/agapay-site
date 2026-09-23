/* global currentParish */
(function () {
  'use strict';
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  let dialog, campaign, parishId;
  function ensureDialog() {
    if (dialog) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/parish/campaign-embed.css?v=20260923campaign1';
    document.head.append(style);
    dialog = document.createElement('dialog');
    dialog.className = 'campaign-embed-editor';
    dialog.setAttribute('aria-labelledby', 'campaignEmbedHeading');
    dialog.innerHTML = `<header><div><p>On your parish website</p><h2 id="campaignEmbedHeading">Embed your campaign</h2></div><button type="button" data-close aria-label="Close campaign embed editor">Close</button></header>
      <p>Your story, progress, photos, updates, and donation form stay together on your website. AGAPAY branding remains visible at the top and beside the giving form.</p>
      <div class="campaign-embed-grid"><div>
        <label>Published parish campaign page URL<input id="campaignEmbedPage" type="url" placeholder="https://yourparish.org/restore-our-church"></label>
        <p class="campaign-embed-help">Use the published page address, not an Elementor editor or preview link. Share buttons will point to this parish page.</p>
        <div class="campaign-embed-colors"><label>Button color<input id="campaignEmbedPrimary" type="color" value="#0b1f30"></label><label>Progress color<input id="campaignEmbedAccent" type="color" value="#b18a3e"></label><label>Background<input id="campaignEmbedBackground" type="color" value="#ece5d8"></label></div>
        <label>Heading style<select id="campaignEmbedFont"><option value="serif">Traditional serif</option><option value="sans">Clean sans serif</option></select></label>
        <label>Page introduction<textarea id="campaignEmbedIntro" rows="4" maxlength="3000"></textarea></label>
        <p class="campaign-embed-help">The heading and introduction are published directly in your website HTML so search engines can read them. Edit them here or in Elementor. Live campaign data inside the embed updates from AGAPAY; this introduction is a snapshot.</p>
        <button type="button" data-preview>Update preview &amp; code</button>
        <label>Elementor HTML widget code<textarea id="campaignEmbedCode" rows="7" readonly spellcheck="false"></textarea></label>
        <button type="button" data-copy>Copy Elementor embed code</button>
        <p id="campaignEmbedStatus" role="status" aria-live="polite"></p>
        <details><summary>Elementor setup &amp; SEO</summary><ol><li>Create a page on the parish website. Set its title, page URL, and SEO description in WordPress.</li><li>Drag an <strong>HTML widget</strong> into an Elementor container and paste all of this code. Allow the container to use its full width and automatic height.</li><li>Publish or update, then check the live page on desktop and mobile. Test the live page as well as the Elementor editor.</li></ol><p>If WordPress removes scripts, the iframe still works at a fixed height. An administrator can allow the loader, or add it using Elementor Custom Code. Security or optimization plugins may need to allow agapay.app. Checkout opens in a separate tab.</p><p>Embedding does not guarantee search rankings. Share the parish page URL and keep useful campaign text on that page. The AGAPAY public campaign URL remains available as a fallback.</p></details>
      </div><div><p class="campaign-embed-help">Live preview · Theme settings cannot remove AGAPAY branding.</p><iframe id="campaignEmbedPreview" title="Campaign website embed preview" allow="payment"></iframe></div></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-preview]').addEventListener('click', update);
    dialog.querySelector('[data-copy]').addEventListener('click', async () => {
      if (!update()) return;
      try {
        await navigator.clipboard.writeText(document.getElementById('campaignEmbedCode').value);
        say('Copied. Paste into an Elementor HTML widget, then publish the page.');
      } catch {
        document.getElementById('campaignEmbedCode').select();
        say('Select and copy the code above; clipboard access is unavailable.');
      }
    });
    dialog.addEventListener('close', () => {
      document.getElementById('campaignEmbedPreview').src = 'about:blank';
    });
  }
  function say(text) {
    document.getElementById('campaignEmbedStatus').textContent = text;
  }
  function update() {
    const code = document.getElementById('campaignEmbedCode');
    code.value = '';
    try {
      const page = new URL(document.getElementById('campaignEmbedPage').value);
      if (page.protocol !== 'https:' || page.username || page.password || page.search || page.hash)
        throw new Error('Enter the published HTTPS page URL without a query string, fragment, or login details.');
      const slug = campaign.slug || campaign.id;
      const url = new URL(
        '/give/campaign-embed/' + encodeURIComponent(parishId) + '/' + encodeURIComponent(slug),
        location.origin
      );
      const options = {
        primary: document.getElementById('campaignEmbedPrimary').value,
        accent: document.getElementById('campaignEmbedAccent').value,
        background: document.getElementById('campaignEmbedBackground').value,
        font: document.getElementById('campaignEmbedFont').value,
        page: page.href,
      };
      Object.entries(options).forEach(([key, value]) => url.searchParams.set(key, value));
      document.getElementById('campaignEmbedPreview').src = url.href;
      const intro = document.getElementById('campaignEmbedIntro').value.trim();
      const attributes = Object.entries(options)
        .map(([key, value]) => `data-${key}="${escape(value)}"`)
        .join(' ');
      code.value = `<section aria-label="${escape(campaign.name)}">
  <h2>${escape(campaign.name)}</h2>
  <p>${escape(intro).replace(/\n/g, '<br>')}</p>
  <div data-agapay-campaign="${escape(slug)}" data-parish="${escape(parishId)}" ${attributes}>
    <iframe src="${escape(url.href)}" title="${escape(campaign.name)} — Powered by AGAPAY" width="100%" height="1400" style="display:block;width:100%;border:0" loading="lazy" allow="payment" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>
</section>
<script src="${escape(location.origin)}/campaign-box.js" async></script>`;
      say(
        'Code ready for an Elementor HTML widget. Colors, heading style, and introduction are saved in the copied code.'
      );
      return true;
    } catch (error) {
      say(error.message);
      return false;
    }
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-campaign-embed]');
    if (!button) return;
    campaign = currentParish?.campaigns?.find((item) => item.id === button.dataset.campaignEmbed);
    if (!campaign) return;
    parishId = currentParish.parishId;
    ensureDialog();
    document.getElementById('campaignEmbedIntro').value =
      campaign.description || `Support ${campaign.name} at ${currentParish.parishName || 'our parish'}.`;
    document.getElementById('campaignEmbedCode').value = '';
    document.getElementById('campaignEmbedHeading').textContent = 'Embed ' + campaign.name;
    dialog.showModal();
    if (document.getElementById('campaignEmbedPage').value) update();
    else say('Enter the parish website page URL to generate your embed.');
  });
})();

// Generated from src/browser/myagapay/groups-presentation.ts by npm run build:browser. Do not edit.
function renderGroupWorkspaceError(target, tab, message) {
  target.innerHTML =
    '<div class="group-signups-empty"><strong data-group-error-title></strong><p data-group-error-message></p></div>';
  target.querySelector('[data-group-error-title]').textContent = `Unable to load ${tab}`;
  target.querySelector('[data-group-error-message]').textContent = String(message || 'Please try again.');
}
function renderGroupMessageContent(message) {
  const caption = message.body ? `<p>${groupsEscape(message.body)}</p>` : '';
  if (['voice', 'image'].includes(message.messageType) && !message.attachmentUrl) {
    return `<p class="group-attachment-expired">${groupsEscape(message.body || (message.messageType === 'voice' ? 'Voice message (no longer available)' : 'Photo (no longer available)'))}</p>`;
  }
  if (message.messageType === 'voice') {
    const bars = Array.from({ length: 36 }, () => '<span></span>').join('');
    return `<div class="group-voice-note" data-voice-message="${groupsEscape(message.id)}">
      <button type="button" class="group-voice-toggle" onclick="toggleGroupVoiceMessage('${groupsEscape(message.id)}')" aria-label="Play voice message">${groupComposerIcons.play}</button>
      <div class="group-voice-waveform" role="img" aria-label="Voice message waveform">${bars}</div>
      <time class="group-voice-duration">${groupsEscape(groupDuration(message.attachmentDurationSeconds))}</time>
    </div>${caption}`;
  }
  if (message.messageType === 'image') {
    return `<div class="group-photo-message"><img data-group-photo="${groupsEscape(message.id)}" data-attachment-url="${groupsEscape(message.attachmentUrl)}" alt="Photo shared by ${groupsEscape(message.authorName)}" /><span>Loading photo…</span></div>${caption}`;
  }
  return caption;
}
function renderDecodedWaveform(messageId, audioBuffer) {
  const container = document.querySelector(`[data-voice-message="${CSS.escape(messageId)}"] .group-voice-waveform`);
  if (!container) return;
  const bars = [...container.querySelectorAll('span')];
  const samples = audioBuffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(samples.length / bars.length));
  bars.forEach((bar, index) => {
    let peak = 0;
    const start = index * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, Math.abs(samples[cursor]));
    bar.style.setProperty('--wave-peak', String(Math.max(0.16, Math.min(1, peak * 2.4))));
  });
}
function renderMinistrySchedule(target, events, members, group) {
  target.innerHTML = `${delegatedHeadcountPanel(group)}<div class="group-signups-head"><div><span class="eyebrow">Ministry calendar</span><h3>Schedule</h3><p>Plan meetings and serving dates, then record who attended.</p></div></div><details class="group-signup-create"><summary>+ Add an event</summary><form onsubmit="createMinistryEvent(event)"><label>Event name<input name="title" required maxlength="180" placeholder="Coffee Hour preparation" /></label><label>Starts<input type="datetime-local" name="startsAt" required /></label><label>Location<input name="location" maxlength="240" placeholder="Parish hall" /></label><label>Repeat weekly<select name="repeatCount"><option value="1">One time</option><option value="4">4 weeks</option><option value="8">8 weeks</option><option value="12">12 weeks</option></select></label><label class="is-wide">Details<textarea name="description" rows="2"></textarea></label><button class="btn btn-gold" type="submit">Add to schedule</button></form></details><div class="ministry-event-list">${events.length ? events.map((e) => `<article><div><span class="eyebrow">${groupsEscape(groupSignupDisplayDate(e.starts_at))}</span><h3>${groupsEscape(e.title)}</h3><p>${groupsEscape(e.location || 'Location to be confirmed')}${e.description ? ` · ${groupsEscape(e.description)}` : ''}</p></div><div class="ministry-event-actions"><details><summary>Attendance (${Number(e.attendance_count || 0)})</summary><div>${members.map((m) => `<button type="button" onclick="recordMinistryAttendance('${groupsEscape(e.id)}','${groupsEscape(m.personId)}','present')">✓ ${groupsEscape(m.name)}</button>`).join('')}</div></details><button class="group-signup-delete" onclick="deleteMinistryEvent('${groupsEscape(e.id)}')">Delete</button></div></article>`).join('') : '<div class="group-signups-empty"><strong>No upcoming events</strong><p>Add the next meeting or serving date.</p></div>'}</div>`;
}
function renderMinistryMembers(target, members) {
  const mine = members.find((m) => m.mine);
  target.innerHTML = `<div class="group-signups-head"><div><span class="eyebrow">Serving together</span><h3>Members</h3><p>Everyone currently assigned by the parish to this ministry.</p></div></div><form class="ministry-availability" onsubmit="saveMinistryAvailability(event)"><label>My availability or serving notes<input name="availabilityNote" maxlength="300" value="${groupsEscape(mine?.availabilityNote || '')}" placeholder="Available first and third Sundays" /></label><button type="submit">Save</button></form><div class="ministry-member-grid">${members.map((m) => `<article><span>${groupsEscape((m.name || 'M').slice(0, 1))}</span><div><strong>${groupsEscape(m.name)}</strong><small>${groupsEscape(m.role)}${m.mine ? ' · You' : ''}</small><p>${groupsEscape(m.availabilityNote || 'No availability note')}</p></div></article>`).join('')}</div>`;
}
function renderMinistryResources(target, resources) {
  target.innerHTML = `<div class="group-signups-head"><div><span class="eyebrow">Shared library</span><h3>Resources</h3><p>Keep checklists, instructions, training, and useful links close at hand.</p></div></div><details class="group-signup-create"><summary>+ Share a resource</summary><form onsubmit="createMinistryResource(event)"><label>Title<input name="title" required maxlength="180" /></label><label>Type<select name="resourceType"><option value="checklist">Checklist</option><option value="document">Document</option><option value="training">Training</option><option value="link">Link</option></select></label><label class="is-wide">Link<input name="url" type="url" placeholder="https://" /></label><label class="is-wide">Notes<textarea name="notes" rows="3"></textarea></label><button class="btn btn-gold" type="submit">Share resource</button></form></details><div class="ministry-resource-grid">${resources.length ? resources.map((r) => `<article><span>${groupsEscape(r.resource_type)}</span><h3>${groupsEscape(r.title)}</h3><p>${groupsEscape(r.notes || '')}</p><div>${r.url ? `<a href="${groupsEscape(r.url)}" target="_blank" rel="noopener">Open resource ↗</a>` : ''}<button class="group-signup-delete" onclick="deleteMinistryResource('${groupsEscape(r.id)}')">Delete</button></div></article>`).join('') : '<div class="group-signups-empty"><strong>No shared resources</strong><p>Add the ministry’s first checklist or useful link.</p></div>'}</div>`;
}
async function renderMinistryCommerceQr(parishId, variantId) {
  const target = document.getElementById(`commerceQr-${CSS.escape(variantId)}`);
  const url = ministryCommerceQrUrl(parishId, variantId);
  if (!target || !url || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const rawSvg = qr
    .createSvgTag(4, 3)
    .replace(/<svg /, '<svg role="img" aria-label="Payment QR code" ')
    .replace(/fill="#000000"/g, 'fill="#061522"');
  ministryCommerceQrSvgByVariant[variantId] = ministryCommerceBrandQrSvg(rawSvg, '');
  target.innerHTML = ministryCommerceQrSvgByVariant[variantId];
  const logoHref = await ministryCommerceMarkDataUri();
  if (logoHref) {
    ministryCommerceQrSvgByVariant[variantId] = ministryCommerceBrandQrSvg(rawSvg, logoHref);
    if (target.isConnected) target.innerHTML = ministryCommerceQrSvgByVariant[variantId];
  }
}
function renderMinistryCommerce(target, items, parishId) {
  ministryGroupsState.commerceParishId = parishId;
  ministryGroupsState.commerceItems = items;
  target.innerHTML = `<div class="group-signups-head"><div><span class="eyebrow">Feast days &amp; fundraisers</span><h3>Meals &amp; Events</h3><p>Price a dinner, festival plate, or fundraiser item. Each listing gets its own QR code you can print and post — guests can pay without installing the app.</p></div></div>
    <details class="group-signup-create" id="ministryCommerceCreatePanel"><summary>+ Add an item</summary>
      <form id="ministryCommerceCreateForm" onsubmit="createMinistryCommerceItemUI(event)">
        <label>Listing type<select name="offeringKind" required><option value="event">Event</option><option value="meal">Meal</option></select></label>
        <label>Item name<input name="name" required maxlength="180" placeholder="Adult dinner plate" /></label>
        <label>Price<div class="money-input"><i>$</i><input name="priceCents" type="number" min="0.01" step="0.01" required placeholder="18.00" /></div></label>
        <label>Event date<input name="eventDate" type="date" required /></label>
        <label>Start time<input name="eventStartTime" type="time" /></label>
        <label>End time<input name="eventEndTime" type="time" /></label>
        <label>Location<input name="eventLocation" maxlength="200" placeholder="Parish Hall" /></label>
        <label>Quantity available<input name="stockQuantity" type="number" min="0" step="1" placeholder="e.g. 60" /></label>
        <label>Limit per order <small>(optional)</small><input name="maxQuantityPerOrder" type="number" min="1" step="1" placeholder="e.g. 6" /></label>
        <label>Publication<select name="status"><option value="active">Publish now</option><option value="draft">Save as draft</option></select></label>
        <label class="is-wide">Description<textarea name="description" rows="2" maxlength="600" placeholder="Roast lamb, rice pilaf, salad, and bread"></textarea></label>
        <label class="is-wide ministry-commerce-calendar-check"><input name="showOnCalendar" type="checkbox" checked /><span>Show on the parish calendar when published</span></label>
        <p class="ministry-commerce-duplicate-note" id="ministryCommerceDuplicateNote" hidden>Duplicating <strong id="ministryCommerceDuplicateSource"></strong> — pick a new date before saving.</p>
        <button class="btn btn-gold" type="submit">Create listing &amp; get QR code</button>
      </form>
    </details>
    <div id="ministryCommerceNewQr"></div>
    <div class="ministry-commerce-grid">${
      items.length
        ? items
            .map(
              (item) => `<article class="ministry-commerce-card">
      <div><span class="eyebrow">${item.offeringKind === 'meal' ? 'Meal' : 'Event'} · ${item.eventDate ? groupsEscape(item.eventDate) : 'No date set'}${item.eventStartTime ? ` · ${groupsEscape(item.eventStartTime)}` : ''}${item.eventLocation ? ` · ${groupsEscape(item.eventLocation)}` : ''}</span><h3>${groupsEscape(item.name)}</h3><p>${groupsEscape(item.description || '')}</p><p><strong>${ministryCommerceMoney(item.priceCents)}</strong>${item.trackInventory ? ` · ${Number(item.stockQuantity || 0)} available` : ''} · <em>${item.status === 'active' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Archived'}</em> · ${item.showOnCalendar ? 'On parish calendar' : 'Calendar hidden'}</p></div>
      <details class="ministry-commerce-qr-toggle" ontoggle="if(this.open) renderMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}')">
        <summary>Show payment QR code</summary>
        <div class="ministry-commerce-qr-panel">
          <div id="commerceQr-${groupsEscape(item.variantId)}" class="ministry-commerce-qr-image" aria-live="polite"></div>
          <div class="ministry-commerce-qr-actions">
            <button type="button" onclick="copyMinistryCommerceLink('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}')">Copy link</button>
            <button type="button" onclick="downloadMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}','${groupsEscape(item.name)}','png')">Download PNG</button>
            <button type="button" onclick="downloadMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}','${groupsEscape(item.name)}','svg')">Download SVG</button>
          </div>
        </div>
      </details>
      <div class="ministry-commerce-card-actions">
        <button type="button" onclick="duplicateMinistryCommerceItem('${groupsEscape(item.id)}')">Duplicate for next year</button>
        <button type="button" onclick="toggleMinistryCommerceCalendar('${groupsEscape(item.id)}',${item.showOnCalendar ? 'false' : 'true'})">${item.showOnCalendar ? 'Hide from calendar' : 'Show on calendar'}</button>
        <button class="group-signup-delete" onclick="toggleMinistryCommerceItemStatus('${groupsEscape(item.id)}','${item.status === 'active' ? 'archived' : 'active'}')">${item.status === 'active' ? 'Archive' : 'Publish'}</button>
      </div>
    </article>`
            )
            .join('')
        : '<div class="group-signups-empty"><strong>No listings yet</strong><p>Add your first dinner plate or fundraiser item above.</p></div>'
    }</div>`;
}
function renderGroupSignupManager() {
  const target = document.getElementById('groupSignupsWorkspace');
  const group = ministryGroupsState.groups.find(({ id }) => id === ministryGroupsState.activeGroupId);
  if (!target || !group) return;
  if (ministryGroupsState.activeSignup) {
    renderGroupSignupDetail(
      target,
      ministryGroupsState.activeSignup.sheet,
      ministryGroupsState.activeSignup.slots || []
    );
    return;
  }
  target.innerHTML = `
    <div class="group-signups-head"><div><span class="eyebrow">Leader tools</span><h3>Signup forms</h3><p>Create and manage the ways parishioners can serve ${groupsEscape(group.name)}.</p></div></div>
    <details class="group-signup-create"><summary>+ Create a signup form</summary><form onsubmit="createGroupSignup(event)">
      <label>Title<input name="title" maxlength="180" required placeholder="Sunday coffee hour" /></label>
      <label>Category<select name="category">${groupSignupCategoryOptions()}</select></label>
      <label class="is-wide">Description<textarea name="description" maxlength="2000" rows="3" placeholder="Help parishioners understand what they are signing up to do."></textarea></label>
      <div class="group-signup-form-actions is-wide"><button class="btn btn-gold" type="submit">Create draft</button></div>
    </form></details>
    ${ministryGroupsState.signupTemplates.length ? `<div class="group-signup-templates"><span class="eyebrow">Reusable templates</span>${ministryGroupsState.signupTemplates.map((t) => `<button onclick="createGroupSignupFromTemplate('${groupsEscape(t.id)}','${groupsEscape(t.title)}')"><strong>${groupsEscape(t.name)}</strong><small>Use template</small></button>`).join('')}</div>` : ''}
    <div class="group-signup-list">${
      ministryGroupsState.signupSheets.length
        ? ministryGroupsState.signupSheets
            .map(
              (sheet) => `
      <button type="button" class="group-signup-row" onclick="openGroupSignup('${groupsEscape(sheet.id)}')"><span><em class="is-${groupsEscape(sheet.status)}">${groupsEscape(sheet.status)}</em><strong>${groupsEscape(sheet.title)}</strong><small>${groupsEscape(groupSignupCategoryLabel(sheet.category))} · ${Number(sheet.slotCount)} slot${Number(sheet.slotCount) === 1 ? '' : 's'} · ${Number(sheet.openingCount)} open</small></span><b aria-hidden="true">›</b></button>
    `
            )
            .join('')
        : '<div class="group-signups-empty"><strong>No signup forms yet</strong><p>Create a draft, add the needed slots, then open it to the parish.</p></div>'
    }</div>`;
}
function renderGroupSignupDetail(target, sheet, slots) {
  const statusButtons = `${sheet.status === 'draft' ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','open')">Open to parish</button>` : ''}${sheet.status === 'open' ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','closed')">Close signups</button>` : ''}${sheet.status === 'closed' ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','open')">Reopen</button>` : ''}${sheet.status !== 'archived' ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','archived')">Archive</button>` : ''}`;
  target.innerHTML = `
    <div class="group-signup-detail-head"><button type="button" onclick="closeGroupSignup()">← All forms</button><div><span class="eyebrow">${groupsEscape(sheet.status)} signup</span><h3>${groupsEscape(sheet.title)}</h3></div><a href="/myagapay/signups?sheet=${encodeURIComponent(sheet.id)}">Preview parish view ↗</a></div>
    <form class="group-signup-edit-form" onsubmit="updateGroupSignup(event,'${groupsEscape(sheet.id)}')">
      <label>Title<input name="title" maxlength="180" required value="${groupsEscape(sheet.title)}" /></label>
      <label>Category<select name="category">${groupSignupCategoryOptions(sheet.category)}</select></label>
      <label class="is-wide">Description<textarea name="description" maxlength="2000" rows="3">${groupsEscape(sheet.description || '')}</textarea></label>
      <div class="group-signup-form-actions is-wide"><button class="btn btn-primary" type="submit">Save form</button><div>${statusButtons}<button type="button" onclick="saveGroupSignupTemplate('${groupsEscape(sheet.id)}')">Save as template</button><button type="button" onclick="showGroupSignupHistory('${groupsEscape(sheet.id)}')">History</button></div><button class="group-signup-delete" type="button" onclick="deleteGroupSignup('${groupsEscape(sheet.id)}')">Delete form</button></div>
    </form>
    <div class="group-signup-slots-head"><div><span class="eyebrow">Signup choices</span><h3>Slots</h3></div><small>Edit what is needed, how many people can help, and when.</small></div>
    <div class="group-signup-slot-editor">${
      slots.length
        ? slots
            .map(
              (slot) => `
      <form onsubmit="updateGroupSignupSlot(event,'${groupsEscape(slot.id)}')"><div class="group-signup-slot-summary"><strong>${groupsEscape(slot.label)}</strong><span>${groupsEscape(groupSignupDisplayDate(slot.slotDate))} · ${Number(slot.filledCount)} of ${Number(slot.neededCount)} filled</span></div><div class="group-signup-slot-fields"><label>What is needed<input name="label" maxlength="180" required value="${groupsEscape(slot.label)}" /></label><label>People needed<input name="neededCount" type="number" min="${Math.max(1, Number(slot.filledCount) || 1)}" max="100" required value="${Number(slot.neededCount)}" /></label><label>Date and time<input name="slotDate" type="datetime-local" value="${groupsEscape(groupSignupLocalDate(slot.slotDate))}" /></label><label>Notes<input name="notes" maxlength="500" value="${groupsEscape(slot.notes || '')}" /></label></div>${slot.entries?.length ? `<div class="group-signup-servants"><span class="eyebrow">Serving</span>${slot.entries.map((entry) => `<div><span><strong>${groupsEscape(entry.personName)}</strong>${entry.comment ? `<small>${groupsEscape(entry.comment)}</small>` : ''}</span>${entry.completed ? `<em>${entry.attended ? 'Served' : 'Excused'}${entry.thanked ? ' · Thanked' : ''}</em>` : `<button type="button" onclick="completeGroupSignupEntry('${groupsEscape(entry.id)}')">Mark served + thank</button>`}</div>`).join('')}</div>` : ''}<div class="group-signup-slot-actions"><button type="submit">Save slot</button><button class="group-signup-delete" type="button" onclick="deleteGroupSignupSlot('${groupsEscape(slot.id)}')"${Number(slot.filledCount) ? ' disabled title="A slot with commitments cannot be deleted"' : ''}>Delete</button></div></form>
    `
            )
            .join('')
        : '<div class="group-signups-empty"><strong>No slots yet</strong><p>Add the first way a parishioner can help.</p></div>'
    }</div>
    <form class="group-signup-add-slot" onsubmit="addGroupSignupSlot(event,'${groupsEscape(sheet.id)}')"><div><span class="eyebrow">Add another choice</span><h3>New slot</h3></div><label>What is needed<input name="label" maxlength="180" required placeholder="Set up coffee and refreshments" /></label><label>People needed<input name="neededCount" type="number" min="1" max="100" value="1" required /></label><label>Date and time<input name="slotDate" type="datetime-local" /></label><label>Notes<input name="notes" maxlength="500" placeholder="Optional details" /></label><button class="btn btn-gold" type="submit">Add slot</button></form>`;
}
function renderGroupCatchUp(panel, data) {
  const members = data.members || [];
  if (!data.latestMessage) {
    panel.innerHTML =
      '<strong>Who’s caught up</strong><p>Post the first message to begin tracking the latest-message read status.</p>';
    return;
  }
  panel.innerHTML = `<div class="group-catch-up-head"><div><strong>Who’s caught up</strong><small>${Number(data.caughtUpCount || 0)} of ${Number(data.memberCount || 0)} read the latest message</small></div><time>${groupsEscape(groupMessageTime(data.latestMessage.createdAt))}</time></div><ul>${members
    .map((member) => {
      const label = !member.accountLinked ? 'No linked account' : member.caughtUp ? 'Caught up' : 'Not yet';
      return `<li><span><strong>${groupsEscape(member.displayName)}</strong><small>${member.role === 'leader' ? 'Leader' : 'Member'}</small></span><em class="${member.caughtUp ? 'is-caught-up' : ''}">${label}</em></li>`;
    })
    .join('')}</ul>`;
}
function ministryCommerceBrandQrSvg(svg, logoHref) {
  const badge = `
    <g class="agapay-qr-badge" aria-hidden="true">
      <circle cx="50%" cy="50%" r="10.5%" fill="#FFFDF9" stroke="#C8A24A" stroke-width="1.4"/>
      ${logoHref ? `<image href="${logoHref}" x="41.5%" y="41.5%" width="17%" height="17%" preserveAspectRatio="xMidYMid meet"/>` : ''}
    </g>`;
  return svg.replace('</svg>', `${badge}</svg>`);
}
function ministryCommerceDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function downloadMinistryCommerceQr(parishId, variantId, itemName, extension) {
  if (!ministryCommerceQrSvgByVariant[variantId] || !ministryCommerceQrSvgByVariant[variantId].includes('<image ')) {
    await renderMinistryCommerceQr(parishId, variantId);
  }
  const svg = ministryCommerceQrSvgByVariant[variantId];
  if (!svg) {
    groupStatus('QR code is not ready yet.');
    return;
  }
  const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const filenameBase =
    String(itemName || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event';
  if (extension === 'svg') {
    ministryCommerceDownloadBlob(`${filenameBase}-qr.svg`, new Blob([withNs], { type: 'image/svg+xml;charset=utf-8' }));
    groupStatus('QR code SVG downloaded.');
    return;
  }
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([withNs], { type: 'image/svg+xml;charset=utf-8' }));
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1200, 1200);
    context.drawImage(image, 0, 0, 1200, 1200);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        groupStatus('Unable to create the QR code PNG.');
        return;
      }
      ministryCommerceDownloadBlob(`${filenameBase}-qr.png`, blob);
      groupStatus('QR code PNG downloaded.');
    }, 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    groupStatus('Unable to render the QR code PNG.');
  };
  image.src = svgUrl;
}
async function copyMinistryCommerceLink(parishId, variantId) {
  const url = ministryCommerceQrUrl(parishId, variantId);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    groupStatus('Payment link copied.');
  } catch {
    groupStatus(url);
  }
}
function duplicateMinistryCommerceItem(productId) {
  const source = (ministryGroupsState.commerceItems || []).find((item) => item.id === productId);
  if (!source) return;
  const panel = document.getElementById('ministryCommerceCreatePanel');
  const form = document.getElementById('ministryCommerceCreateForm');
  if (!panel || !form) return;
  panel.open = true;
  form.elements.name.value = source.name || '';
  form.elements.offeringKind.value = source.offeringKind === 'meal' ? 'meal' : 'event';
  form.elements.priceCents.value = source.priceCents ? (source.priceCents / 100).toFixed(2) : '';
  form.elements.eventDate.value = '';
  form.elements.eventStartTime.value = source.eventStartTime || '';
  form.elements.eventEndTime.value = source.eventEndTime || '';
  form.elements.eventLocation.value = source.eventLocation || '';
  form.elements.stockQuantity.value = String(source.stockQuantity || '');
  form.elements.maxQuantityPerOrder.value = String(source.maxQuantityPerOrder || '');
  form.elements.description.value = source.description || '';
  form.elements.status.value = 'draft';
  form.elements.showOnCalendar.checked = source.showOnCalendar !== false;
  const note = document.getElementById('ministryCommerceDuplicateNote');
  const noteSource = document.getElementById('ministryCommerceDuplicateSource');
  if (note && noteSource) {
    noteSource.textContent = source.name;
    note.hidden = false;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.eventDate.focus();
}
async function createMinistryCommerceItemUI(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const d = new FormData(form);
  const priceCents = Math.round(Number(d.get('priceCents') || 0) * 100);
  const body = {
    offeringKind: d.get('offeringKind'),
    name: d.get('name'),
    description: d.get('description'),
    priceCents,
    eventDate: d.get('eventDate'),
    eventStartTime: d.get('eventStartTime'),
    eventEndTime: d.get('eventEndTime'),
    eventLocation: d.get('eventLocation'),
    stockQuantity: d.get('stockQuantity') ? Number(d.get('stockQuantity')) : 0,
    maxQuantityPerOrder: d.get('maxQuantityPerOrder') ? Number(d.get('maxQuantityPerOrder')) : null,
    showOnCalendar: d.get('showOnCalendar') === 'on',
    status: d.get('status'),
  };
  const result = await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  if (!result) return;
  groupStatus(
    body.status === 'draft'
      ? `${body.name} was saved as a draft.`
      : `${body.name} is live and appears on the parish calendar.`
  );
  form.reset();
  form.elements.showOnCalendar.checked = true;
  await loadActiveGroupWorkspace('commerce');
  requestAnimationFrame(() => {
    const qrTarget = document.getElementById(`commerceQr-${result.variantId}`);
    const details = qrTarget?.closest('details');
    if (details) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      renderMinistryCommerceQr(result.parishId, result.variantId);
    }
  });
}
async function toggleMinistryCommerceItemStatus(productId, nextStatus) {
  await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }
  );
  groupStatus(nextStatus === 'archived' ? 'Listing archived.' : 'Listing published.');
  await loadActiveGroupWorkspace('commerce');
}
async function toggleMinistryCommerceCalendar(productId, showOnCalendar) {
  await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify({ showOnCalendar: Boolean(showOnCalendar) }) }
  );
  groupStatus(showOnCalendar ? 'Listing added to the parish calendar.' : 'Listing hidden from the parish calendar.');
  await loadActiveGroupWorkspace('commerce');
}

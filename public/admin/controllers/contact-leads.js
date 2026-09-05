// Uses the existing Admin session and MFA-aware fetch wrapper.
let contactLeadsCursor = null;
async function loadContactLeads(more = false) {
  const container = document.getElementById('contactLeads');
  const status = document.getElementById('contactLeadsStatus');
  const next = document.getElementById('contactLeadsMore');
  status.textContent = 'Loading contact submissions…';
  try {
    const response = await fetch(`/api/admin/contact-leads${more && contactLeadsCursor ? `?before=${encodeURIComponent(contactLeadsCursor)}` : ''}`, { headers: authHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load contacts.');
    if (!more) container.replaceChildren();
    for (const lead of body.leads) {
      const card = document.createElement('details');
      card.className = 'section-card';
      const summary = document.createElement('summary');
      summary.textContent = `${lead.name || 'Contact'} — ${lead.topic || 'Message'} — ${lead.notificationStatus} (${lead.attempts} attempts)`;
      const details = document.createElement('div');
      details.className = 'section-body';
      const content = document.createElement('pre');
      content.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';
      content.textContent = `Reference: ${lead.id}\nSubmitted: ${lead.submittedAt || ''}\nEmail: ${lead.email || ''}\nOrganization: ${lead.organization || ''}\nProvider ID: ${lead.providerId || '—'}\nLast error: ${lead.lastError || '—'}\nFirst touch: ${lead.attribution?.firstTouch?.category || '—'}\nLast touch: ${lead.attribution?.lastTouch?.category || '—'}\n\n${lead.message || ''}`;
      details.append(content);
      if (lead.retryAvailable) {
        const retry = document.createElement('button');
        retry.className = 'secondary btn-sm';
        retry.textContent = 'Retry notification';
        retry.onclick = async () => {
          retry.disabled = true;
          status.textContent = 'Retrying notification…';
          try {
            const result = await fetch(`/api/admin/contact-leads/${encodeURIComponent(lead.id)}/retry`, { method: 'POST', headers: authHeaders() });
            const payload = await result.json();
            if (!result.ok) throw new Error(payload.error || 'Retry failed.');
            await loadContactLeads();
            status.textContent = `Notification ${payload.lead.notificationStatus}. Reference: ${lead.id}`;
          } catch (error) { status.textContent = error.message; retry.disabled = false; }
        };
        details.append(retry);
      } else if (lead.notificationStatus !== 'sent') {
        const note = document.createElement('p');
        note.textContent = 'Sending, or outside the safe retry window. Review the provider delivery history before resending.';
        details.append(note);
        if (lead.reviewRequired) {
          for (const [resolution, label] of [['delivered', 'Confirmed delivered'], ['confirmed_not_delivered', 'Confirmed not delivered — enable retry']]) {
            const resolve = document.createElement('button');
            resolve.className = 'secondary btn-sm';
            resolve.textContent = label;
            resolve.onclick = async () => {
              if (!window.confirm(`Have you checked the provider delivery history for reference ${lead.id}? ${label}.`)) return;
              resolve.disabled = true;
              try {
                const result = await fetch(`/api/admin/contact-leads/${encodeURIComponent(lead.id)}/resolve`, { method: 'POST',
                  headers: authHeaders({ 'Content-Type': 'application/json' }),
                  body: JSON.stringify({ resolution, attempts: lead.attempts, generation: lead.generation }) });
                const payload = await result.json();
                if (!result.ok) throw new Error(payload.error || 'Unable to resolve delivery.');
                await loadContactLeads();
              } catch (error) { status.textContent = error.message; resolve.disabled = false; }
            };
            details.append(resolve);
          }
        }
      }
      card.append(summary, details);
      container.append(card);
    }
    contactLeadsCursor = body.nextCursor;
    next.hidden = !contactLeadsCursor;
    status.textContent = body.leads.length ? 'Contact submissions loaded.' : 'No contact submissions found.';
  } catch (error) { status.textContent = error.message; }
}

/* Ministry overview presentation; data and actions belong to groups.js. */
(() => {
  function render(target, data, { group, members, messages, escape: esc, formatDate }) {
    const action = (tab, label, primary = false) =>
      `<button type="button" class="${primary ? 'koinonia-page-action' : 'groups-refresh'}" data-ministry-tab="${tab}">${label}</button>`;
    const date = (value) => esc(formatDate(value));
    const commitments = data.myCommitments || [];
    const coverage = data.coverageRequests || [];
    const latest = data.latestMessage;
    const author = messages.find((message) => message.id === latest?.id)?.authorName;
    const leaders = (members || []).filter((member) => member.role === 'leader');
    target.innerHTML = `
      <div class="ministry-home-grid">
        <div class="ministry-home-main">
          <section class="ministry-home-next" aria-labelledby="ministryNextHeading">
            <span class="eyebrow">Our next gathering</span>
            <h3 id="ministryNextHeading">${esc(data.event?.title || 'Something to look forward to')}</h3>
            <p>${data.event ? date(data.event.starts_at) : 'There are no upcoming gatherings on the schedule yet.'}</p>
            ${data.event ? `<p class="ministry-home-muted">${esc(data.event.location || 'Location to be confirmed')}</p>` : ''}
            ${data.event?.description ? `<p class="ministry-home-description">${esc(data.event.description)}</p>` : ''}
            ${action('schedule', data.event ? 'View schedule' : 'Open ministry schedule', true)}
          </section>
          <section class="ministry-home-section" aria-labelledby="ministryCommitmentsHeading">
            <div class="ministry-home-section-head"><h3 id="ministryCommitmentsHeading">Your upcoming service</h3>${action('signups', 'All signups')}</div>
            ${commitments.length ? commitments.map((c) => `<a class="ministry-home-row ministry-home-commitment" href="/myagapay/signups?sheet=${encodeURIComponent(c.sheetId || c.sheet_id || '')}"><span><strong>${esc(c.title)}</strong><span>${esc(c.label)} · ${date(c.slot_date)}</span></span><small>Confirmed <span aria-hidden="true">→</span></small></a>`).join('') : '<p class="ministry-home-muted">You have no upcoming commitments. Browse signups to find a way to serve.</p>'}
          </section>
          <section class="ministry-home-section" aria-labelledby="ministryUpdateHeading">
            <div class="ministry-home-section-head"><h3 id="ministryUpdateHeading">From the team</h3></div>
            ${latest ? `<div class="ministry-home-note"><span class="eyebrow">${esc(author || 'Latest message')}</span><p>${esc(latest.body || 'A photo or voice message was shared with the ministry.')}</p><small>${date(latest.created_at)}</small></div>` : '<p class="ministry-home-muted">There are no messages yet. Start a conversation with your ministry.</p>'}
            ${action('messages', 'Open conversation')}
          </section>
        </div>
        <aside class="ministry-home-aside" aria-label="Serving together">
          <section class="ministry-home-section" aria-labelledby="ministryHelpHeading">
            <span class="eyebrow">Lend a hand</span><h3 id="ministryHelpHeading">Ways to help</h3>
            ${data.signup ? `<div class="ministry-home-need"><strong>${esc(data.signup.title)}</strong><p class="ministry-home-muted">${Number(data.signup.openings) || 0} open serving spots</p><a class="koinonia-page-action" href="/myagapay/signups?sheet=${encodeURIComponent(data.signup.id)}">See serving opportunities</a></div>` : '<p class="ministry-home-muted">There are no open signups right now.</p>'}
            ${coverage.map((request) => `<article class="ministry-home-coverage"><h4>${esc(request.requester_name || 'A teammate')} needs coverage</h4><p>${esc(request.title)} · ${esc(request.label)}</p><p class="ministry-home-muted">${date(request.slot_date)}</p>${request.note ? `<p>${esc(request.note)}</p>` : ''}<button type="button" class="groups-refresh" data-ministry-coverage="${esc(request.id)}">I can cover</button></article>`).join('')}
          </section>
          <section class="ministry-home-section" aria-labelledby="ministryPeopleHeading">
            <h3 id="ministryPeopleHeading">Your people</h3>
            ${
              members
                ? `<div class="ministry-home-avatars" aria-hidden="true">${members
                    .slice(0, 4)
                    .map(
                      (member) =>
                        `<span>${esc(
                          member.name
                            .split(/\s+/)
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join('')
                        )}</span>`
                    )
                    .join(
                      ''
                    )}${members.length > 4 ? `<span>+${members.length - 4}</span>` : ''}</div><p>${members.length} ${members.length === 1 ? 'member' : 'members'} serving together</p>${leaders.length ? `<p class="ministry-home-muted">Coordinated by ${esc(leaders.map((member) => member.name).join(', '))}</p>` : ''}`
                : '<p class="ministry-home-muted">Meet your fellow members and share your availability.</p>'
            }
            ${action('members', 'Meet the team')}
          </section>
          <section class="ministry-home-section" aria-labelledby="ministryResourcesHeading">
            <h3 id="ministryResourcesHeading">Good to have handy</h3>
            ${data.resource ? `<div class="ministry-home-resource"><span class="eyebrow">${esc(data.resource.resource_type || 'Resource')}</span><h4>${esc(data.resource.title)}</h4>${data.resource.notes ? `<p class="ministry-home-muted">${esc(data.resource.notes)}</p>` : ''}</div>` : '<p class="ministry-home-muted">Shared checklists, instructions, and useful links will appear here.</p>'}
            ${action('resources', 'Open resources')}
          </section>
        </aside>
      </div>
      <p class="ministry-home-footer">${esc(group.name)} · Serving together</p>`;
    target.onclick = async (event) => {
      const button = event.target.closest('button');
      if (!button || !target.contains(button)) return;
      if (button.dataset.ministryTab) await window.switchGroupWorkspace(button.dataset.ministryTab);
      if (button.dataset.ministryCoverage) {
        button.disabled = true;
        try {
          await window.acceptMinistryCoverage(button.dataset.ministryCoverage);
        } catch (error) {
          window.groupStatus(error.message || 'Unable to accept this request. Please try again.');
        } finally {
          button.disabled = false;
        }
      }
    };
  }
  window.MinistryHome = Object.freeze({ render });
})();

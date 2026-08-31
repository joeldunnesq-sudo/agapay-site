'use strict';

/* global escapeHtml, currentParish, setStatus, authHeaders, shortDate */
/* exported populateGivingStatementsPanel, previewGivingStatement, startGivingStatementJob */

// Giving statements; read shared identity and catalog state only when actions run.

// ── ANNUAL GIVING STATEMENTS ───────────────────────────────
let gsJobHistoryLoaded = false;

function populateGivingStatementsPanel() {
  if (!currentParish?.entitlements?.givingFeatures?.annualStatements) return;
  const yearSel = document.getElementById('gsFiscalYear');
  if (yearSel && !yearSel.dataset.populated) {
    const nowYear = new Date().getFullYear();
    const years = [nowYear - 1, nowYear, nowYear - 2, nowYear - 3];
    yearSel.innerHTML = years.map((y, i) => `<option value="${y}" ${i === 0 ? 'selected' : ''}>${y}</option>`).join('');
    yearSel.dataset.populated = '1';
  }
  const donorSel = document.getElementById('gsPreviewDonor');
  if (donorSel) {
    const givers = (Array.isArray(window.pdxGiversAll) ? window.pdxGiversAll : []).filter((g) => g.email);
    donorSel.innerHTML = givers.length
      ? givers
          .map(
            (g) =>
              `<option value="${escapeHtml(g.email)}">${escapeHtml(g.name || g.email)} (${escapeHtml(g.email)})</option>`
          )
          .join('')
      : '<option value="">No donors with gifts loaded yet</option>';
  }
  if (!gsJobHistoryLoaded) {
    gsJobHistoryLoaded = true;
    loadGivingStatementJobHistory();
  }
}

async function previewGivingStatement(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  const fiscalYear = document.getElementById('gsFiscalYear')?.value;
  const donorEmail = document.getElementById('gsPreviewDonor')?.value;
  if (!fiscalYear || !donorEmail) {
    setStatus('Choose a tax year and donor to preview.', 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/preview',
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: Number(fiscalYear), donorEmail }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to generate preview.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function startGivingStatementJob(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  const fiscalYear = document.getElementById('gsFiscalYear')?.value;
  if (!fiscalYear) {
    setStatus('Choose a tax year first.', 'error');
    return;
  }
  if (!confirm(`Generate and email ${fiscalYear} giving statements to every donor who gave this parish that year?`))
    return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/jobs',
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: Number(fiscalYear) }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to start the giving-statement batch.');
    setStatus(`Started generating statements for ${data.totalDonors} donor(s).`, 'success');
    const progress = document.getElementById('gsJobProgress');
    if (progress) progress.hidden = false;
    pollGivingStatementJob(data.jobId);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function pollGivingStatementJob(jobId) {
  if (!currentParish) return;
  const textEl = document.getElementById('gsJobProgressText');
  try {
    const res = await fetch(
      '/api/parish/dashboard/' +
        encodeURIComponent(currentParish.parishId) +
        '/giving-statements/jobs/' +
        encodeURIComponent(jobId),
      { headers: authHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to check batch status.');
    if (textEl) {
      textEl.textContent = `${data.status.replace(/_/g, ' ')} — ${data.processedDonors}/${data.totalDonors} processed (${data.sentCount} sent, ${data.failedCount} failed)`;
    }
    if (data.status === 'pending' || data.status === 'running') {
      setTimeout(() => pollGivingStatementJob(jobId), 3000);
    } else {
      const progress = document.getElementById('gsJobProgress');
      if (progress)
        setTimeout(() => {
          progress.hidden = true;
        }, 8000);
      loadGivingStatementJobHistory();
    }
  } catch (err) {
    if (textEl) textEl.textContent = err.message;
  }
}

async function loadGivingStatementJobHistory() {
  if (!currentParish) return;
  const wrap = document.getElementById('gsJobHistory');
  if (!wrap) return;
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/jobs',
      { headers: authHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load batch history.');
    const jobs = data.jobs || [];
    if (!jobs.length) {
      wrap.innerHTML = '<div class="pdx-recurring-empty">No giving-statement batches generated yet.</div>';
      return;
    }
    wrap.innerHTML = `<table class="history-table"><thead><tr><th>Tax year</th><th>Status</th><th>Sent</th><th>Failed</th><th>Started</th></tr></thead><tbody>${jobs
      .map(
        (j) => `
        <tr>
          <td>${escapeHtml(String(j.fiscalYear))}</td>
          <td>${escapeHtml(String(j.status).replace(/_/g, ' '))}</td>
          <td>${escapeHtml(String(j.sentCount))} / ${escapeHtml(String(j.totalDonors))}</td>
          <td>${escapeHtml(String(j.failedCount))}</td>
          <td>${escapeHtml(shortDate(j.createdAt))}</td>
        </tr>`
      )
      .join('')}</tbody></table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="pdx-recurring-empty">${escapeHtml(err.message)}</div>`;
  }
}

// Generated from src/browser/donor/session.ts by npm run build:browser. Do not edit.
(function () {
  'use strict';
  const storageKeys = Object.freeze({
    email: 'agapayDonorEmail',
    token: 'agapayDonorToken',
    profile: 'agapayDonorProfile',
    learnPlan: 'agapay.learn.plan',
    parishCapabilities: 'agapay.parishCapabilities.v1',
    navigationTransition: 'agapay.navigationTransition.v1',
  });
  function session() {
    return {
      email: localStorage.getItem(storageKeys.email) || '',
      token: localStorage.getItem(storageKeys.token) || '',
    };
  }
  function profile() {
    try {
      return JSON.parse(localStorage.getItem(storageKeys.profile) || '{}');
    } catch {
      return {};
    }
  }
  function setProfile(donor) {
    if (!donor) return;
    localStorage.setItem(storageKeys.profile, JSON.stringify(donor));
    if (donor.email) localStorage.setItem(storageKeys.email, donor.email);
  }
  function clearSession() {
    const email = String(session().email || profile()?.email || '')
      .trim()
      .toLowerCase();
    Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
    const cachedKeys = [];
    if (email) {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(`agapayDonorCache:${email}:`)) cachedKeys.push(key);
      }
    }
    cachedKeys.forEach((key) => localStorage.removeItem(key));
  }
  function saveSession(payload, fallbackEmail = '') {
    const email = payload?.donor?.email || fallbackEmail;
    const previousEmail = session().email;
    if (email && previousEmail && email.trim().toLowerCase() !== previousEmail.trim().toLowerCase()) clearSession();
    if (payload?.token) localStorage.setItem(storageKeys.token, payload.token);
    if (email) localStorage.setItem(storageKeys.email, email);
    if (payload?.donor) setProfile({ ...payload.donor, ...(email ? { email } : {}) });
  }
  function authHeaders(extra = {}) {
    const current = session();
    const headers = { Accept: 'application/json', ...extra };
    if (current.token) headers.Authorization = `Bearer ${current.token}`;
    if (current.email) headers['X-AGAPAY-Donor-Email'] = current.email;
    return headers;
  }
  window.AGAPAYDonorSession = Object.freeze({
    storageKeys,
    session,
    profile,
    setProfile,
    saveSession,
    clearSession,
    authHeaders,
  });
})();

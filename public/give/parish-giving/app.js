(function () {
  "use strict";

  function usd(cents) {
    return (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function formatDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return iso; }
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / 86400000);
  }

  function el(id) { return document.getElementById(id); }
  let activeCampaign = null;
  let activeParish = null;
  let activeCanonicalUrl = "";

  function firstPhotoUrl(photos) {
    const first = Array.isArray(photos) ? photos.find(Boolean) : null;
    return typeof first === "string" ? first : first?.url || "";
  }

  function campaignPhotoUrl(campaign, parish) {
    return campaign.coverPhotoUrl
      || campaign.coverUrl
      || campaign.imageUrl
      || campaign.photoUrl
      || firstPhotoUrl(campaign.photos)
      || parish.imageUrl
      || parish.logoUrl
      || "";
  }

  function parseParams() {
    const url   = new URL(window.location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    const isCanonicalCampaign = parts[0] === "give" && parts.length >= 3 && parts[2].endsWith("-campaign");
    const slug = isCanonicalCampaign
      ? decodeURIComponent(parts[2]).replace(/-campaign$/, "")
      : decodeURIComponent(parts[2] || url.searchParams.get("c") || "");
    const parishId = isCanonicalCampaign
      ? decodeURIComponent(parts[1] || "")
      : url.searchParams.get("parish") || "";
    return { slug, parishId };
  }

  function campaignPageUrl(parishId, slug) {
    const campaignSlug = String(slug || "campaign").replace(/-campaign$/, "");
    return window.location.origin + "/give/" + encodeURIComponent(parishId) + "/" + encodeURIComponent(campaignSlug) + "-campaign";
  }

  async function fetchCampaign(parishId, slug) {
    const candidates = [slug, `${slug}-campaign`];
    for (const candidate of candidates) {
      const qs = new URLSearchParams({ parish: parishId, slug: candidate });
      const res = await fetch("/api/campaign?" + qs);
      if (res.ok) return res.json();
      if (res.status !== 404) throw new Error("Unable to load campaign");
    }
    throw new Error("Campaign not found");
  }

  function setMeta(name, content) {
    const el = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
    if (el) el.setAttribute("content", content);
  }

  function applyOgTags(campaign, parish, canonicalUrl) {
    const title = campaign.name + " — " + parish.name;
    const desc  = (campaign.description || "").substring(0, 200).replace(/\n/g, " ") || ("Support " + parish.name + " through AGAPAY.");
    const img   = campaignPhotoUrl(campaign, parish);
    document.title = title + " | AGAPAY";
    setMeta("og:title", title); setMeta("og:description", desc);
    setMeta("og:image", img);   setMeta("og:url", canonicalUrl);
    setMeta("twitter:title", title); setMeta("twitter:description", desc); setMeta("twitter:image", img);
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute("content", desc);
    const canonicalEl = document.getElementById("campaignCanonicalUrl");
    if (canonicalEl) canonicalEl.setAttribute("href", canonicalUrl);
  }

  function renderThermometer(campaign) {
    const container = el("thermoContainer");
    try {
      const raised = Number(campaign.raisedCents || 0);
      const goal   = Number(campaign.goalCents   || 0);
      const pct    = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
      const count  = Number(campaign.giftCount || 0);
      el("thermoRaised").textContent      = usd(raised);
      el("thermoGoal").textContent        = goal > 0 ? "of " + usd(goal) + " goal" : "raised so far";
      el("thermoPct").textContent         = goal > 0 ? pct + "%" : "";
      el("thermoGiftCount").textContent   = count + " gift" + (count !== 1 ? "s" : "");
      setTimeout(() => { el("thermoFill").style.width = pct + "%"; }, 120);
    } catch (err) {
      displaySectionError("giving progress", container, err);
    }
  }

  function renderHero(campaign, parish) {
    const container = el("campaignHero") || document.querySelector(".campaign-hero");
    try {
      const src = campaignPhotoUrl(campaign, parish);
      if (src) {
        const img = el("heroImg");
        img.onload  = () => { el("heroSkeleton").hidden = true; img.hidden = false; el("heroOverlay").hidden = false; el("heroBadge").hidden = false; };
        img.onerror = () => {
          img.hidden = true;
          displaySectionError("campaign image", container, new Error("Image failed to load: " + src));
        };
        img.src = src; img.alt = campaign.name;
      } else {
        el("heroSkeleton").hidden = false;
        el("heroOverlay").hidden = true;
        el("heroBadge").hidden = false;
      }
    } catch (err) {
      displaySectionError("campaign image", container, err);
    }
  }

  function renderGallery(photos) {
    const gallery = el("photoGallery");
    if (!photos || !photos.length) { if (gallery) gallery.hidden = true; return; }
    try {
      photos.forEach(photo => {
        const url = typeof photo === "string" ? photo : photo.url;
        if (!url) return;
        const img = document.createElement("img");
        img.src = url; img.alt = "Campaign photo"; img.loading = "lazy";
        img.onerror = () => { img.remove(); };
        img.addEventListener("click", () => openLightbox(url));
        gallery.appendChild(img);
      });
    } catch (err) {
      displaySectionError("photo gallery", gallery, err);
    }
  }

  function openLightbox(src) { el("lightboxImg").src = src; el("lightbox").hidden = false; document.body.style.overflow = "hidden"; }
  function closeLightbox()   { el("lightbox").hidden = true; el("lightboxImg").src = ""; document.body.style.overflow = ""; }

  function renderUpdates(updates) {
    if (!updates || !updates.length) return;
    const section = el("updatesSection");
    try {
      section.hidden = false;
      const list   = el("updatesList");
      const sorted = [...updates].sort((a, b) => new Date(b.date) - new Date(a.date));
      el("updatesCount").textContent = sorted.length + " " + (sorted.length === 1 ? "post" : "posts");
      sorted.forEach(u => {
        const div = document.createElement("div");
        div.className = "update-item";
        div.innerHTML = '<div class="update-line"></div><div><div class="update-date">' + formatDate(u.date) + '</div><div class="update-body">' + escHtml(u.body || "") + '</div></div>';
        list.appendChild(div);
      });
    } catch (err) {
      displaySectionError("parish updates", section, err);
    }
  }

  function selectedCampaignKey(campaign) {
    return campaign.id || campaign.slug || campaign.feastId || campaign.name || "campaign";
  }

  async function handleCampaignCheckout(event) {
    event.preventDefault();
    const status = el("campaignCheckoutStatus");
    const submit = el("giveBtn");
    if (!activeCampaign || !activeParish) return;

    const amount = Number(el("campaignAmount")?.value || 0);
    const firstName = String(el("campaignFirstName")?.value || "").trim();
    const lastName = String(el("campaignLastName")?.value || "").trim();
    const email = String(el("campaignEmail")?.value || "").trim();
    if (!amount || amount <= 0) {
      status.textContent = "Enter a gift amount to continue.";
      status.className = "campaign-checkout-status error";
      return;
    }
    if (!firstName || !email) {
      status.textContent = "Enter your first name and email to continue.";
      status.className = "campaign-checkout-status error";
      return;
    }

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Opening secure checkout...";
    status.textContent = "";
    status.className = "campaign-checkout-status";

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          parishId: activeParish.parishId || activeParish.id || "",
          giftType: "campaign",
          amount,
          frequency: "once",
          campaign: selectedCampaignKey(activeCampaign),
          campaignDescription: activeCampaign.name || "",
          paymentMethod: "card",
          coverFees: true,
          firstName,
          lastName,
          email,
          source: "campaign_page",
          returnPath: window.location.pathname + window.location.search,
          ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {})
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "Unable to start checkout");
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      throw new Error(result.message || "Stripe checkout did not return a link.");
    } catch (err) {
      status.textContent = err.message || "Checkout failed. Please try again.";
      status.className = "campaign-checkout-status error";
    } finally {
      submit.disabled = false;
      submit.textContent = original;
    }
  }

  function wireCheckoutControls() {
    const amountInput = el("campaignAmount");
    document.querySelectorAll(".quick-amount").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".quick-amount").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        if (amountInput) amountInput.value = button.dataset.amount || "50";
      });
    });
    amountInput?.addEventListener("input", () => {
      document.querySelectorAll(".quick-amount").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.amount) === Number(amountInput.value));
      });
    });
    el("campaignCheckoutForm")?.addEventListener("submit", handleCampaignCheckout);
    el("topbarGiveBtn")?.addEventListener("click", (event) => {
      event.preventDefault();
      el("campaignAmount")?.focus();
      document.querySelector(".progress-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function displaySectionError(name, container, err) {
    console.error("[AGAPAY] " + name + " failed:", err);
    if (!container) return;
    const msg = err && err.message ? escHtml(err.message) : "Unknown error";
    container.innerHTML =
      "<div class='section-error-boundary'>" +
        "<h3>Unable to load " + escHtml(name) + "</h3>" +
        "<p>This section could not be displayed. The rest of the page is unaffected.</p>" +
        "<code>" + msg + "</code>" +
      "</div>";
  }

  function wireShareButtons(canonicalUrl, title) {
    el("shareFacebook").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(canonicalUrl);
    el("shareTwitter").href  = "https://twitter.com/intent/tweet?url=" + encodeURIComponent(canonicalUrl) + "&text=" + encodeURIComponent(title);
    el("shareWhatsApp").href = "https://wa.me/?text=" + encodeURIComponent(title + " " + canonicalUrl);
    el("shareEmail").href = "mailto:?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent("Support this parish campaign: " + canonicalUrl);
    const copyCampaignLink = async (button) => {
      try { await navigator.clipboard.writeText(canonicalUrl); } catch { /* fallback */ }
      const btn = button;
      btn.classList.add("copied");
      const original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => { btn.classList.remove("copied"); btn.textContent = original; }, 2200);
    };
    el("shareCopy").addEventListener("click", () => copyCampaignLink(el("shareCopy")));
    el("topbarShareBtn")?.addEventListener("click", () => copyCampaignLink(el("topbarShareBtn")));
  }

  function renderStatus(status) {
    const badge = el("statusBadge");
    const map = { active: { label:"Active", cls:"status-active" }, completed: { label:"Completed", cls:"status-completed" }, paused: { label:"Paused", cls:"status-paused" } };
    const s = map[status] || map.active;
    badge.textContent = s.label; badge.className = "status-badge " + s.cls; badge.hidden = false;
  }

  function renderDeadline(endsAt) {
    if (!endsAt) return;
    const days = daysUntil(endsAt);
    const note = el("deadlineNote"); note.hidden = false;
    if (days === 0)     note.textContent = "Campaign ends today";
    else if (days === 1) note.textContent = "1 day remaining";
    else if (days > 0)  note.textContent = days + " days remaining";
    else                note.textContent = "Ended " + formatDate(endsAt);
  }

  async function init() {
    const { slug, parishId } = parseParams();
    if (!slug || !parishId) { el("loadingState").hidden = true; el("errorState").hidden = false; return; }
    try {
      const data     = await fetchCampaign(parishId, slug);
      const campaign = data.campaign;
      const parish   = data.parish;
      const canonicalUrl = campaignPageUrl(parishId, campaign.slug || slug);
      activeCampaign = campaign;
      activeParish = parish;
      activeCanonicalUrl = canonicalUrl;

      applyOgTags(campaign, parish, canonicalUrl);
      renderHero(campaign, parish);

      const parishName = parish.name || "Orthodox Parish";
      const parishImage = parish.imageUrl || parish.logoUrl || "";
      const initials = parishName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
      el("headerParishName").textContent = parishName;
      if (parishImage) {
        el("parishAvatar").src = parishImage;
        el("parishAvatar").alt = parishName;
        el("parishInitials").textContent = "";
      } else {
        el("parishAvatar").hidden = true;
        el("parishInitials").textContent = initials || "A";
      }
      el("parishNameLabel").textContent = parish.name || "";
      const location = [parish.city, parish.state].filter(Boolean).join(", ");
      el("parishLocationLabel").textContent = location;
      if (!location) {
        el("parishLocationLabel").hidden = true;
        document.querySelector(".organizer-label")?.classList.add("without-location");
      }
      el("campaignTitle").textContent   = campaign.name || "Campaign";
      renderStatus(campaign.status || "active");
      el("campaignDescription").textContent = campaign.description || "";

      if (campaign.photos && campaign.photos.length) renderGallery(campaign.photos);
      renderUpdates(campaign.updates);
      renderThermometer(campaign);

      el("topbarGiveBtn").href  = "#campaignCheckoutForm";
      if (campaign.status === "completed") {
        el("giveBtn").textContent      = "Campaign Completed — Thank You";
        el("giveBtn").style.background = "var(--stone)";
        el("giveBtn").disabled = true;
      }
      renderDeadline(campaign.endsAt);
      wireShareButtons(canonicalUrl, campaign.name + " — " + parish.name);

      el("loadingState").hidden    = true;
      el("campaignContent").hidden = false;
    } catch (err) {
      console.error("[AGAPAY] Campaign page init failed — parish:", parishId, "slug:", slug, err);
      el("loadingState").hidden = true;
      el("errorState").hidden   = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireCheckoutControls();
    init();
    el("lightbox").addEventListener("click", closeLightbox);
    el("lightboxClose").addEventListener("click", closeLightbox);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });
  });
})();

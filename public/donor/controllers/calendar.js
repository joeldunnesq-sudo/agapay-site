function calendarShortDateIso(value) {
  if (!value) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map((part) => Number(part));
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
  }
  return shortDate(value);
}

function annualIsoFromParishDate(value, year) {
  const raw = String(value || "").trim();
  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(raw);
  const short = /^(\d{1,2})[/-](\d{1,2})$/.exec(raw);
  const month = iso ? Number(iso[1]) : short ? Number(short[1]) : 0;
  const day = iso ? Number(iso[2]) : short ? Number(short[2]) : 0;
  if (!month || !day) return "";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parishPatronalFeastForYear(parish, year, calendar, feasts) {
  if (!parish) return null;
  const selected = String(parish.patronalFeast || parish.parishPatronalFeast || parish.patronalFeastId || "").trim();
  const customName = String(parish.parishPatronalFeastName || parish.patronalFeastName || "").trim();
  const parishName = parish.name || parish.parishName || "Your parish";
  if (selected) {
    const match = feasts.find((feast) => feast.id === selected || feast.name === selected);
    if (match) return { ...match, rank: "patronal", name: customName || match.name };
  }

  const customDate = annualIsoFromParishDate(parish.parishPatronalFeastDate || parish.patronalFeastDate, year);
  if (!customDate) return null;
  const [civilYear, civilMonth, civilDay] = customDate.split("-").map(Number);
  return {
    id: "parish-patronal-feast",
    name: customName || `${parishName} Patronal Feast`,
    type: "parish",
    rank: "patronal",
    calendar,
    date: customDate,
    displayDate: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(civilYear, civilMonth - 1, civilDay))
  };
}

const donorCalendarState = {
  liturgicalDay: null,
  calendar: "julian",
  date: ""
};

function todayIsoLocal() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function longDateParts(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
    monthDay: new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date),
    year: new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date),
    dayNum: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date),
    monthYear: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date)
  };
}

function churchCalendarDate(civilIso, calendar) {
  if (String(calendar || "").toLowerCase().includes("gregorian")) return civilIso;
  const values = String(civilIso || "").split("-").map(Number);
  const api = window.AGAPAYLiturgicalCalendar;
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value)) || !api?.gregorianToJdn) return civilIso;
  const julianDay = api.gregorianToJdn(values[0], values[1], values[2]);
  const c = julianDay + 32082;
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = d - 4800 + Math.floor(m / 10);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function liturgicalRankLabel(rank = "") {
  const key = String(rank || "").toLowerCase();
  if (key.includes("great")) return "Great Feast";
  if (key.includes("major")) return "Major Feast";
  if (key.includes("holy-week")) return "Holy Week";
  if (key.includes("bright-week")) return "Bright Week";
  if (key.includes("fast")) return "Fast";
  if (key.includes("season")) return "Season";
  return "";
}

function isFastRule(rule = "") {
  return /fast/i.test(String(rule || "")) && !/no fast/i.test(String(rule || ""));
}

function toneOfWeekLabel(tone = "") {
  const text = String(tone || "").trim();
  if (!text) return "";
  const number = text.match(/\b(\d+)\b/);
  return number ? `Tone of the Week ${number[1]}` : text.replace(/^Tone\b/i, "Tone of the Week");
}

function saintDisplayTitle(day = {}) {
  const stories = Array.isArray(day.saintStories) ? day.saintStories : [];
  const names = Array.isArray(day.saints) ? day.saints : [];
  const primary = stories.find((story) => story?.primary) || stories[0];
  return day.primarySaintTitle || primary?.name || primary?.title || names[0] || "Lives of the Saints";
}

function saintStoryModalHtml(saints = [], unavailableMessage = "") {
  if (unavailableMessage) return `<div class="donor-saint-empty">${escapeHtml(unavailableMessage)}</div>`;
  if (!saints.length) return `<div class="donor-saint-empty">No saint life is listed for this day yet. Please try again later.</div>`;
  return saints.map((saint) => {
    const paragraphs = String(saint.storyText || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return `
      <article class="donor-saint-story">
        <div class="donor-saint-story-head">
          ${saint.iconUrl ? `<img src="${escapeHtml(saint.iconUrl)}" alt="" />` : `<span>✥</span>`}
          <div>
            <h3>${escapeHtml(saint.name || saint.title || "Saint of the Day")}</h3>
            ${saint.reposeCentury ? `<small>${escapeHtml(saint.reposeCentury)}</small>` : ""}
            ${saint.feastRank ? `<small>${escapeHtml(saint.feastRank)}</small>` : ""}
          </div>
        </div>
        ${paragraphs.length ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") : `<p>A life-story text is not listed for this commemoration.</p>`}
      </article>
    `;
  }).join("");
}

function liturgicalReadingRows(today = {}) {
  const appointments = Array.isArray(today.readingAppointments) && today.readingAppointments.length
    ? today.readingAppointments
    : [
        today.epistleRef && { type: "epistle", ref: today.epistleRef, appointment: "" },
        today.gospelRef && { type: "gospel", ref: today.gospelRef, appointment: "" },
      ].filter(Boolean);
  const groups = new Map();
  appointments.forEach((reading) => {
    const type = String(reading?.type || "").toLowerCase();
    const ref = String(reading?.ref || "").trim();
    if (!ref || (type !== "epistle" && type !== "gospel")) return;
    const appointment = String(reading?.appointment || "").trim();
    if (!groups.has(appointment)) groups.set(appointment, []);
    groups.get(appointment).push({ type, ref });
  });

  const rows = [];
  groups.forEach((readings, appointment) => {
    if (groups.size > 1) rows.push({
      text: appointment
        ? `${/(?:^|\s)(?:St\.?|Saint)\s/i.test(appointment) ? "Saint" : "Feast"} — ${appointment}`
        : "Readings of the day",
      className: "cal-reading-line is-heading"
    });
    ["epistle", "gospel"].forEach((type) => {
      readings.filter((reading) => reading.type === type).forEach((reading) => rows.push({
        text: `${type === "epistle" ? "Epistle" : "Gospel"}: ${reading.ref}`,
        className: "cal-reading-line"
      }));
    });
  });
  return rows;
}

function renderDonorTodayInChurch(parish, payload) {
  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const date = payload?.date || todayIsoLocal();
  const civilParts = longDateParts(date);
  const churchParts = longDateParts(churchCalendarDate(date, calendar));
  const usesJulianCalendar = calendarLabel(calendar) === "Julian";
  const today = payload?.today || {};
  const feast = payload?.feast || null;
  const feastTitle = today.primarySaintTitle || today.feastTitle || feast?.name || (civilParts.weekday === "Sunday" ? "The Lord's Day" : "Today in the Church");
  const fastingRule = today.fastingRule || (feast?.rank === "fast" ? "Fast" : "No Fast");
  const saintTitle = saintDisplayTitle(today);
  const stories = Array.isArray(today.saintStories) ? today.saintStories : [];
  const saintNames = Array.isArray(today.saints) ? today.saints : [];
  const nameDays = Array.isArray(today.nameDays) ? today.nameDays : [];
  const nameDayText = nameDays.length
    ? `Name days today: ${nameDays.map((item) => `${item.displayName} (${item.saintName})`).join(", ")}.`
    : "";
  const firstStory = stories.find((story) => story?.primary) || stories[0] || {};
  const saintCount = stories.length || saintNames.length;
  const giveHref = donorGiftUrl("feast", parish, { feast: feastTitle });
  donorCalendarState.liturgicalDay = today;
  donorCalendarState.calendar = calendar;
  donorCalendarState.date = date;

  setText("todayCivilDateEyebrow", `${civilParts.weekday}, ${civilParts.monthDay}, ${civilParts.year}`);
  setText("todayWeekday", civilParts.weekday.slice(0, 3));
  setText("todayMonthDay", churchParts.dayNum);
  setText("todayYear", churchParts.monthYear);
  setText("todayCalendarLabel", `${calendarLabel(calendar)} calendar date`);
  setText("todayChurchDateCalendar", "Julian");
  const churchDateBadge = document.getElementById("todayChurchDateBadge");
  if (churchDateBadge) churchDateBadge.hidden = !usesJulianCalendar;
  const dateHeadingRow = document.querySelector(".parish-life-liturgical-hero .cal-date-heading-row");
  if (dateHeadingRow) dateHeadingRow.classList.toggle("is-civil-only", !usesJulianCalendar);
  setText("todayFeastTitle", feastTitle);
  const feastNote = document.getElementById("todayFeastNote");
  if (feastNote) {
    const unavailableNote = "Daily readings and saint lives are temporarily unavailable, but feast highlights still follow your Church calendar.";
    const readingLines = liturgicalReadingRows(today);
    if (nameDayText) readingLines.push({ text: nameDayText, className: "cal-reading-line is-guidance" });
    if (today.sourceConnected === false || !readingLines.length) {
      feastNote.textContent = today.sourceConnected === false
        ? unavailableNote
        : "Daily readings, saints, and fasting notes follow the Orthodox calendar.";
    } else {
      feastNote.replaceChildren(...readingLines.map((reading) => {
        const line = document.createElement("span");
        line.className = reading.className;
        line.textContent = reading.text;
        return line;
      }));
    }
  }
  const existingSaintCard = document.getElementById("saintPreviewCard");
  const dedicatedSaintCard = existingSaintCard && !existingSaintCard.classList.contains("cal-saint-chip") ? existingSaintCard : null;
  if (dedicatedSaintCard) {
    setText("saintPreviewName", saintTitle);
    setText("saintPreviewNote", saintCount > 1
      ? `${saintCount} commemorations listed for today.`
      : firstStory.reposeCentury || "Open the life for today's commemoration.");
    const saintIcon = document.getElementById("saintPreviewIcon");
    if (saintIcon) saintIcon.innerHTML = firstStory.iconUrl ? `<img src="${escapeHtml(firstStory.iconUrl)}" alt="" />` : "✥";
  }
  const chips = document.getElementById("todayChips");
  if (chips) {
    const standardChips = [
      liturgicalRankLabel(today.feastRank || feast?.rank),
      fastingRule,
      toneOfWeekLabel(today.tone),
      dedicatedSaintCard && saintCount ? `${saintCount} saint${saintCount === 1 ? "" : "s"}` : "",
      nameDays.length ? `${nameDays.length} name day${nameDays.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean).map((chip) => `<span class="${isFastRule(chip) ? "is-fast" : ""}">${escapeHtml(chip)}</span>`).join("");
    const saintChip = saintCount && !dedicatedSaintCard
      ? `<button class="cal-saint-chip" id="saintPreviewCard" type="button" onclick="openDonorSaintOfDay(this)" data-date="${escapeHtml(date)}" data-calendar="${escapeHtml(calendar)}" data-saint-title="${escapeHtml(saintTitle)}" aria-label="Open ${saintCount} saint${saintCount === 1 ? "" : "s"} commemorated today">${saintCount} saint${saintCount === 1 ? "" : "s"}<b aria-hidden="true">→</b></button>`
      : "";
    chips.innerHTML = standardChips + saintChip;
  }
  const give = document.getElementById("todayGiveLink");
  if (give) give.href = giveHref;
  if (dedicatedSaintCard) {
    dedicatedSaintCard.dataset.date = date;
    dedicatedSaintCard.dataset.calendar = calendar;
    dedicatedSaintCard.dataset.saintTitle = saintTitle;
    dedicatedSaintCard.disabled = false;
  }
}

async function loadDonorLiturgicalDay(parish) {
  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const date = todayIsoLocal();
  try {
    const parishId = parish?.id || donorProfile()?.defaultParishId || "";
    const res = await fetch(`/api/donor/liturgical-day?date=${encodeURIComponent(date)}&calendar=${encodeURIComponent(calendar)}&parishId=${encodeURIComponent(parishId)}`, {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Unable to load today's liturgical day.");
    renderDonorTodayInChurch(parish, payload);
  } catch (err) {
    const api = window.AGAPAYLiturgicalCalendar;
    const feast = api?.liturgicalFeastsForYear(new Date().getFullYear(), calendar).find((item) => item.date === date) || null;
    renderDonorTodayInChurch(parish, {
      ok: true,
      date,
      calendar,
      feast,
      today: {
        civilDate: date,
        calendarType: calendar,
        feastTitle: feast?.name || "",
        feastRank: feast?.rank || "",
        fastingRule: feast?.rank === "fast" ? "Fast" : "No Fast",
        saints: feast?.name ? [feast.name] : [],
        saintStories: [],
        sourceConnected: false
      }
    });
  }
}

function showDonorSaintModal(title, subtitle, bodyHtml) {
  setText("donorSaintModalTitle", title || "Saint of the Day");
  setText("donorSaintModalSubtitle", subtitle || "Today's commemoration");
  setHtml("donorSaintModalBody", bodyHtml || "");
  const modal = document.getElementById("donorSaintModal");
  if (modal) modal.hidden = false;
}

function closeDonorSaintModal() {
  const modal = document.getElementById("donorSaintModal");
  if (modal) modal.hidden = true;
}

async function openDonorSaintOfDay(button) {
  const date = button?.dataset.date || donorCalendarState.date || todayIsoLocal();
  const calendar = button?.dataset.calendar || donorCalendarState.calendar || "julian";
  const previousText = button?.textContent || "";
  const isPreviewCard = button?.id === "saintPreviewCard";
  if (button) {
    button.disabled = true;
    if (!isPreviewCard) button.textContent = "Loading...";
  }
  try {
    let day = donorCalendarState.liturgicalDay || {};
    if (!Array.isArray(day.saintStories) || !day.saintStories.length) {
      const res = await fetch(`/api/donor/liturgical-day?date=${encodeURIComponent(date)}&calendar=${encodeURIComponent(calendar)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to load saint life.");
      day = payload.today || {};
      donorCalendarState.liturgicalDay = day;
    }
    const saints = Array.isArray(day.saintStories) ? day.saintStories : [];
    const saintNames = Array.isArray(day.saints) ? day.saints : [];
    showDonorSaintModal(
      saintDisplayTitle(day),
      `Saint of the Day · ${shortDate(date)}`,
      saintStoryModalHtml(saints, day.sourceConnected === false ? "Lives of the Saints are unavailable right now. Please try again later." : (!saints.length && saintNames.length ? saintNames.join("; ") : ""))
    );
  } catch (error) {
    showDonorSaintModal("Saint of the Day Unavailable", "Orthocal.info", saintStoryModalHtml([], error.message || "Lives of the Saints are unavailable right now."));
  } finally {
    if (button) {
      button.disabled = false;
      if (!isPreviewCard) button.textContent = previousText || button.textContent || "Open saint";
    }
  }
}

document.addEventListener("click", (event) => {
  const modal = document.getElementById("donorSaintModal");
  if (modal && !modal.hidden && event.target === modal) closeDonorSaintModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDonorSaintModal();
});

function renderDonorCalendarFeasts(parish) {
  const api = window.AGAPAYLiturgicalCalendar;
  const grid = document.getElementById("calendarGrid");
  const upcomingTarget = document.getElementById("calendarUpcomingFeast");
  if (!grid || !api) return;

  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const now = new Date();
  const year = now.getFullYear();
  const label = api.calendarLabel(calendar);
  const next = api.nextLiturgicalFeast(calendar, now);
  const pascha = api.orthodoxPascha(year);
  const highlightsForYear = (feastYear) => {
    const feasts = api.liturgicalFeastsForYear(feastYear, calendar);
    const patronalFeast = parishPatronalFeastForYear(parish, feastYear, calendar, feasts);
    const highlightMap = new Map(feasts
      .filter((feast) => ["great", "major", "holy-week", "bright-week", "fast"].includes(feast.rank))
      .map((feast) => [feast.id || `${feast.date}-${feast.name}`, feast])
    );
    if (patronalFeast) highlightMap.set(patronalFeast.id || `${patronalFeast.date}-${patronalFeast.name}`, patronalFeast);
    return Array.from(highlightMap.values())
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.name || "").localeCompare(String(b.name || "")));
  };
  const highlighted = highlightsForYear(year);
  const todayIso = todayIsoLocal();
  const upcomingFeast = [...highlighted, ...highlightsForYear(year + 1)]
    .filter((feast) => ["great", "major", "patronal"].includes(feast.rank) && String(feast.date || "") >= todayIso)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.name || "").localeCompare(String(b.name || "")))[0] || null;

  setText("calendarModePill", label);
  setText("nextFeastDate", calendarShortDateIso(next?.date));
  setText("nextFeastName", next?.name || "No feast found.");
  setText("paschaDate", calendarShortDateIso(pascha?.date));
  setText("calendarShortName", calendar === "gregorian" ? "Revised-Julian" : "Julian");
  setText("calendarFullName", label);

  if (!highlighted.length) {
    grid.innerHTML = '<div class="cal-timeline-empty">Feast highlights will appear once your parish calendar loads.</div>';
    return;
  }

  // Map rank → visual class + pill label
  const rankMeta = (rank) => {
    switch (rank) {
      case "great":
      case "holy-week":   return { cls: "great",  label: "Great Feast" };
      case "bright-week": return { cls: "bright", label: "Bright Week" };
      case "fast":        return { cls: "fast",   label: "Fast" };
      case "patronal":    return { cls: "patronal", label: "Patronal" };
      default:             return { cls: "major",  label: "Major" };
    }
  };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const feastRowHtml = (feast, extraClass = "") => {
    const meta = rankMeta(feast.rank);
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(feast.date || ""));
    const monthIdx = match ? Number(match[1]) - 1 : 0;
    const day = match ? String(Number(match[2])) : "";
    return `
      <div class="cal-feast-row ${meta.cls}${extraClass}">
        <div class="cal-feast-date">
          <div class="cal-feast-date-day">${escapeHtml(day)}</div>
          <div class="cal-feast-date-mon">${escapeHtml(MONTHS_SHORT[monthIdx] || "")}</div>
        </div>
        <div class="cal-feast-name">${escapeHtml(feast.name)}</div>
        <span class="cal-feast-rank ${meta.cls}">${escapeHtml(meta.label)}</span>
      </div>`;
  };

  if (upcomingTarget) {
    upcomingTarget.innerHTML = upcomingFeast
      ? `<div class="cal-feast-upcoming-label">Upcoming feast</div>${feastRowHtml(upcomingFeast, " is-upcoming")}`
      : '<div class="cal-timeline-empty">No upcoming feast was found.</div>';
  }
  setText("calendarFestalYearLabel", `View the full ${year} festal year`);

  // Group feasts by month (dates are YYYY-MM-DD strings, already chronological)
  const byMonth = new Map();
  highlighted.forEach((feast) => {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(feast.date || ""));
    const monthIdx = m ? Number(m[1]) - 1 : 0;
    const day = m ? String(Number(m[2])) : "";
    if (!byMonth.has(monthIdx)) byMonth.set(monthIdx, []);
    byMonth.get(monthIdx).push({ ...feast, _day: day, _mon: MONTHS_SHORT[monthIdx] });
  });

  const sections = Array.from(byMonth.keys()).sort((a, b) => a - b).map((monthIdx) => {
    const rows = byMonth.get(monthIdx).map((feast) => feastRowHtml(feast)).join("");
    return `<div class="cal-month"><div class="cal-month-label">${MONTHS[monthIdx]}</div>${rows}</div>`;
  }).join("");

  grid.innerHTML = sections;
}

function renderDonorCalendarPrompts(parish) {
  const target = document.getElementById("suggestedGivingPrompts");
  if (!target) return;
  if (!parish) {
    target.innerHTML = `
      <div class="notice">
        Sign in and select your church to load real campaign and fund prompts.
      </div>
    `;
    return;
  }

  const prompts = [];
  const nextFeast = nextFeastForCalendar(parish.liturgicalCalendar);
  if (nextFeast?.name) {
    prompts.push({
      title: `${nextFeast.name} Offering`,
      description: `Support ${parish.name || "your church"} for the upcoming feast.`,
      href: donorGiftUrl("feast", parish, { feast: nextFeast.name }),
      lockedGiftType: parishHasGivingPlus(parish) ? "" : "feast"
    });
  }

  activeParishCampaigns(parish).slice(0, 2).forEach((campaign) => {
    const goalCents = campaignGoalCents(campaign);
    const raisedCents = campaignRaisedCents(campaign);
    const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
    prompts.push({
      title: campaignLabel(campaign),
      description: goalCents > 0
        ? `${money(raisedCents)} of ${money(goalCents)} raised (${percent}%).`
        : (campaign.description || "Parish-approved campaign."),
      href: donorGiftUrl("campaign", parish, { campaign: campaign.id || campaign.feastId || campaign.name })
    });
  });

  (Array.isArray(parish.funds) ? parish.funds : []).slice(0, 2).forEach((fund) => {
    prompts.push({
      title: fund.name || "Designated Fund",
      description: fund.description || "Give toward this parish fund.",
      href: donorGiftUrl("fund", parish, { fund: fund.id || fund.name })
    });
  });

  if (!prompts.length) {
    target.innerHTML = `
      <div class="notice">
        This church has no active campaigns or designated funds listed yet.
      </div>
    `;
    return;
  }

  target.innerHTML = prompts.slice(0, 4).map((prompt) => `
    <a class="cal-prompt${prompt.lockedGiftType ? " giving-tier-locked" : ""}" href="${prompt.lockedGiftType ? "#giving-plus" : escapeHtml(prompt.href)}"${prompt.lockedGiftType ? ` onclick="return openGivingPlusPaywall(event, window.agapaySelectedGivingParish, '${prompt.lockedGiftType}')"` : ""}>
      <span class="cal-prompt-icon"><svg viewBox="0 0 24 24"><path d="M12 2s5 5.5 5 10a5 5 0 0 1-10 0c0-4.5 5-10 5-10z"/><path d="M9 21h6"/></svg></span>
      <span class="cal-prompt-body">
        <span class="cal-prompt-title">${escapeHtml(prompt.title)}</span>
        <span class="cal-prompt-note">${escapeHtml(prompt.description)}</span>
      </span>
      <span class="cal-prompt-arrow"><svg viewBox="0 0 24 24" fill="none"><polyline points="9 18 15 12 9 6"/></svg></span>
    </a>
  `).join("");
}

function donorApprovedSacramentEvents(payload = {}) {
  const labels = typeof sacramentTypeLabels === "object" ? sacramentTypeLabels : {};
  const today = new Date().toISOString().slice(0,10);
  return (payload.requests || []).filter(request => request.status === "scheduled" && (request.confirmedDate || request.requestedDate) >= today).map(request => ({
    ...request,
    date:request.confirmedDate || request.requestedDate,
    time:request.confirmedTime || request.requestedTimeWindow || "Time to be confirmed",
    title:request.otherTypeLabel || labels[request.sacramentType] || String(request.sacramentType || "Parish service").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())
  })).sort((left, right) => left.date.localeCompare(right.date));
}

function renderDonorPersonalCalendar(payload = {}) {
  const section = document.getElementById("personalUpcomingServicesCard");
  const target = document.getElementById("personalUpcomingServices");
  if (!section || !target) return;
  const events = donorApprovedSacramentEvents(payload);
  section.hidden = !events.length;
  target.innerHTML = events.map(event => {
    const date = new Date(`${event.date}T12:00:00`);
    return `<a class="cal-personal-event" href="/myagapay/services"><span class="cal-personal-date"><strong>${escapeHtml(date.toLocaleDateString(undefined,{day:"numeric"}))}</strong><small>${escapeHtml(date.toLocaleDateString(undefined,{month:"short"}))}</small></span><span><em>Approved by your parish</em><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.time)}${event.clergyAssigned ? ` · ${escapeHtml(event.clergyAssigned)}` : ""}</small></span><i aria-hidden="true">›</i></a>`;
  }).join("");
}

function donorParishCalendarSubscriptionUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function donorParishCalendarGoogleUrl(value = "") {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "calendar.google.com") return "";
    const match = url.pathname.match(/^\/calendar\/ical\/([^/]+)\/public\/basic\.ics$/i);
    if (!match) return "";
    const calendarId = decodeURIComponent(match[1]);
    return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
  } catch {
    return "";
  }
}

function donorParishCalendarPlatform() {
  const userAgent = String(window.navigator?.userAgent || "");
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "other";
}

function donorParishCalendarEventDate(event = {}) {
  const startsAt = String(event.startsAt || "");
  if (event.allDay && /^\d{4}-\d{2}-\d{2}/.test(startsAt)) return new Date(`${startsAt.slice(0,10)}T12:00:00`);
  return new Date(startsAt);
}

function donorParishCalendarDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function donorParishCalendarEventDateKey(event = {}) {
  const startsAt = String(event.startsAt || "");
  if (event.allDay && /^\d{4}-\d{2}-\d{2}/.test(startsAt)) return startsAt.slice(0,10);
  return donorParishCalendarDateKey(donorParishCalendarEventDate(event));
}

function donorParishCalendarEventCategory(event = {}) {
  if (event.commerceKind === "meal") return "gold";
  if (event.commerceKind === "event") return "blue";
  const title = String(event.title || "").toLowerCase();
  if (/liturgy|vespers|matins|orthros|paraklesis|akathist|vigil|service|confession/.test(title)) return "gold";
  if (/fellowship|youth|class|study|meeting|festival|community|choir|coffee|ministry/.test(title)) return "blue";
  return "plum";
}

const DONOR_CALENDAR_CELEBRATION_ICONS = {
  birthday: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v9H5zM4 11h16M12 11v9M7 7h10v4H7z"/><path d="M9 7c-1.4-1.2-.7-3 1-3 1.2 0 2 1.1 2 3M15 7c1.4-1.2.7-3-1-3-1.2 0-2 1.1-2 3"/></svg>',
  anniversary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S4.5 15.5 4.5 9.2A4.2 4.2 0 0 1 12 6.6a4.2 4.2 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20Z"/></svg>',
  nameday: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1.7 1.8 2.6 3.3 2.6 4.8a2.6 2.6 0 0 1-5.2 0C9.4 6.3 10.3 4.8 12 3Z"/><path d="M8.5 11h7l-.8 9h-5.4zM7.5 20h9"/></svg>'
};

let donorParishCalendarView = { events:[], celebrations:[], viewMode:"week", periodDate:null, selectedDate:"", unavailable:false };

function donorParishCalendarEventsOn(dateKey) {
  return donorParishCalendarView.events.filter(event => donorParishCalendarEventDateKey(event) === dateKey);
}

function donorParishCalendarCelebrationsOn(dateKey) {
  return donorParishCalendarView.celebrations.filter(item => item.date === dateKey);
}

function donorParishCalendarCelebrationHtml(item = {}) {
  const type = ["birthday", "anniversary", "nameday"].includes(item.type) ? item.type : "nameday";
  const detail = type === "anniversary" && item.years
    ? `${item.years}${item.years === 1 ? " year" : " years"}`
    : item.detail || item.typeLabel || "Parish celebration";
  return `<article class="cal-parish-celebration ${type}"><span class="cal-parish-celebration-icon" aria-hidden="true">${DONOR_CALENDAR_CELEBRATION_ICONS[type]}</span><span class="cal-parish-event-body"><em>${escapeHtml(item.typeLabel || "Celebration")}</em><strong>${escapeHtml(item.label || "Parish family")}</strong><small>${escapeHtml(detail)}</small></span></article>`;
}

function renderDonorParishCalendarSelectedDate() {
  const target = document.getElementById("parishCalendarEventList");
  if (!target) return;
  const dateKey = donorParishCalendarView.selectedDate;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? new Date(`${dateKey}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) {
    target.innerHTML = "";
    return;
  }
  const events = donorParishCalendarEventsOn(dateKey);
  const celebrations = donorParishCalendarCelebrationsOn(dateKey);
  const heading = escapeHtml(date.toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" }));
  if (!events.length && !celebrations.length) {
    target.innerHTML = `<div class="cal-parish-selected-head"><strong>${heading}</strong></div><div class="cal-parish-calendar-empty">${donorParishCalendarView.unavailable ? "We could not refresh events right now." : "No parish events or shared celebrations are scheduled for this day."}</div>`;
    return;
  }
  const counts = [
    events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "",
    celebrations.length ? `${celebrations.length} celebration${celebrations.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean).join(" · ");
  const eventHtml = events.map((event) => {
    const eventDate = donorParishCalendarEventDate(event);
    const time = event.allDay ? "All day" : eventDate.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
    const location = String(event.location || "").trim();
    const description = String(event.description || "").trim();
    const context = [event.typeLabel, event.hostName, event.availabilityLabel].filter(Boolean).join(" · ");
    const href = String(event.href || "").trim();
    const content = `<span class="cal-parish-event-marker" aria-hidden="true"></span><span class="cal-parish-event-body">${context ? `<em>${escapeHtml(context)}</em>` : ""}<strong>${escapeHtml(event.title || "Parish event")}</strong><small>${escapeHtml(time)}${location ? ` · ${escapeHtml(location)}` : ""}</small>${description ? `<p>${escapeHtml(description)}</p>` : ""}</span>`;
    return href
      ? `<a class="cal-parish-event ${donorParishCalendarEventCategory(event)}" href="${escapeHtml(href)}">${content}</a>`
      : `<article class="cal-parish-event ${donorParishCalendarEventCategory(event)}">${content}</article>`;
  }).join("");
  target.innerHTML = `<div class="cal-parish-selected-head"><strong>${heading}</strong><span>${counts}</span></div>${eventHtml}${celebrations.map(donorParishCalendarCelebrationHtml).join("")}`;
}

function donorParishCalendarStartOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function renderDonorParishCalendarMonth() {
  const label = document.getElementById("parishCalendarMonthLabel");
  const grid = document.getElementById("parishCalendarMonthGrid");
  const previous = document.getElementById("parishCalendarPreviousMonth");
  const next = document.getElementById("parishCalendarNextMonth");
  const weekViewButton = document.getElementById("parishCalendarWeekView");
  const monthViewButton = document.getElementById("parishCalendarMonthView");
  const periodDate = donorParishCalendarView.periodDate;
  if (!label || !grid || !previous || !next || !(periodDate instanceof Date)) return;

  const today = new Date();
  const todayKey = donorParishCalendarDateKey(today);
  const latestRangeDate = new Date(today.getTime() + 180 * 86400000);
  const dates = [];
  const cells = [];
  const isWeek = donorParishCalendarView.viewMode === "week";
  weekViewButton?.classList.toggle("is-active", isWeek);
  monthViewButton?.classList.toggle("is-active", !isWeek);
  weekViewButton?.setAttribute("aria-pressed", String(isWeek));
  monthViewButton?.setAttribute("aria-pressed", String(!isWeek));
  grid.classList.toggle("is-week", isWeek);

  if (isWeek) {
    const weekStart = donorParishCalendarStartOfWeek(periodDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    label.textContent = `${weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${weekEnd.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
    const earliestWeek = donorParishCalendarStartOfWeek(today);
    const latestWeek = donorParishCalendarStartOfWeek(latestRangeDate);
    previous.disabled = weekStart <= earliestWeek;
    next.disabled = weekStart >= latestWeek;
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + day);
      dates.push(date);
    }
  } else {
    const firstDay = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
    const daysInMonth = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0).getDate();
    label.textContent = firstDay.toLocaleDateString(undefined, { month:"long", year:"numeric" });
    const earliestMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const latestMonth = new Date(latestRangeDate.getFullYear(), latestRangeDate.getMonth(), 1);
    previous.disabled = firstDay <= earliestMonth;
    next.disabled = firstDay >= latestMonth;
    cells.push(...Array.from({ length:firstDay.getDay() }, () => '<span class="cal-parish-day-spacer" aria-hidden="true"></span>'));
    for (let day = 1; day <= daysInMonth; day += 1) dates.push(new Date(firstDay.getFullYear(), firstDay.getMonth(), day));
  }

  dates.forEach((date) => {
    const dateKey = donorParishCalendarDateKey(date);
    const events = donorParishCalendarEventsOn(dateKey);
    const celebrations = donorParishCalendarCelebrationsOn(dateKey);
    const eventMarkers = events.slice(0, celebrations.length ? 2 : 3).map(event => `<i class="${donorParishCalendarEventCategory(event)}"></i>`);
    const markerHtml = [...eventMarkers, ...(celebrations.length ? ['<i class="celebration"></i>'] : [])].join("");
    const hiddenCount = Math.max(0, events.length + celebrations.length - eventMarkers.length - (celebrations.length ? 1 : 0));
    const countLabel = `${events.length ? `, ${events.length} event${events.length === 1 ? "" : "s"}` : ", no events"}${celebrations.length ? `, ${celebrations.length} celebration${celebrations.length === 1 ? "" : "s"}` : ""}`;
    const hasItems = events.length || celebrations.length;
    cells.push(`<button type="button" class="cal-parish-day${hasItems ? " has-events" : ""}${celebrations.length ? " has-celebrations" : ""}${dateKey === todayKey ? " is-today" : ""}${dateKey === donorParishCalendarView.selectedDate ? " is-selected" : ""}" onclick="selectDonorParishCalendarDate('${dateKey}')" aria-label="${escapeHtml(date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}))}${countLabel}" aria-pressed="${dateKey === donorParishCalendarView.selectedDate}"><span>${date.getDate()}</span>${hasItems ? `<span class="cal-parish-day-markers" aria-hidden="true">${markerHtml}${hiddenCount ? `<b>+${hiddenCount}</b>` : ""}</span>` : ""}</button>`);
  });
  grid.innerHTML = cells.join("");
  renderDonorParishCalendarSelectedDate();
}

function selectDonorParishCalendarDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return;
  donorParishCalendarView.selectedDate = dateKey;
  renderDonorParishCalendarMonth();
}

function setDonorParishCalendarView(viewMode) {
  if (!["week","month"].includes(viewMode)) return;
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(donorParishCalendarView.selectedDate)
    ? new Date(`${donorParishCalendarView.selectedDate}T12:00:00`)
    : new Date();
  donorParishCalendarView.viewMode = viewMode;
  donorParishCalendarView.periodDate = selected;
  renderDonorParishCalendarMonth();
}

function changeDonorParishCalendarPeriod(offset) {
  const current = donorParishCalendarView.periodDate;
  if (!(current instanceof Date) || !Number.isInteger(offset)) return;
  const today = new Date();
  const rangeEnd = new Date(today.getTime() + 180 * 86400000);
  let periodStart;
  let periodEnd;
  if (donorParishCalendarView.viewMode === "week") {
    periodStart = donorParishCalendarStartOfWeek(current);
    periodStart.setDate(periodStart.getDate() + offset * 7);
    const earliestWeek = donorParishCalendarStartOfWeek(today);
    const latestWeek = donorParishCalendarStartOfWeek(rangeEnd);
    if (periodStart < earliestWeek || periodStart > latestWeek) return;
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);
  } else {
    periodStart = new Date(current.getFullYear(), current.getMonth() + offset, 1);
    const earliestMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const latestMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
    if (periodStart < earliestMonth || periodStart > latestMonth) return;
    periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
  }
  donorParishCalendarView.periodDate = periodStart;
  const startKey = donorParishCalendarDateKey(periodStart);
  const endKey = donorParishCalendarDateKey(periodEnd);
  donorParishCalendarView.selectedDate = donorParishCalendarView.events.map(donorParishCalendarEventDateKey).find(key => key >= startKey && key <= endKey) || startKey;
  renderDonorParishCalendarMonth();
}

function renderDonorParishCalendar(payload = {}, parish = null, celebrationPayload = {}) {
  const title = document.getElementById("parishCalendarTitle");
  const status = document.getElementById("parishCalendarStatus");
  const intro = document.getElementById("parishCalendarIntro");
  const subscribe = document.getElementById("parishCalendarSubscribe");
  const subscribeButton = document.getElementById("parishCalendarSubscribeButton");
  const googleButton = document.getElementById("parishCalendarGoogleButton");
  const copyButton = document.getElementById("parishCalendarCopyButton");
  const help = document.getElementById("parishCalendarSubscribeHelp");
  const monthView = document.getElementById("parishCalendarMonth");
  const target = document.getElementById("parishCalendarEventList");
  if (!title || !status || !intro || !monthView || !target) return;

  const parishName = parish?.name || donorProfile()?.defaultParish?.name || "Your Church";
  const subscriptionUrl = donorParishCalendarSubscriptionUrl(payload.subscriptionUrl);
  const events = Array.isArray(payload.events) ? payload.events : [];
  const celebrations = Array.isArray(celebrationPayload.items) ? celebrationPayload.items : [];
  const connected = Boolean(payload.connected && subscriptionUrl);
  const calendarAvailable = connected || events.length > 0 || celebrations.length > 0;
  const hasSubscriptionControls = Boolean(subscribe && subscribeButton && googleButton && copyButton && help);
  if (title.dataset.calendarTitle !== "fixed") title.textContent = `${parishName} Calendar`;
  status.classList.toggle("is-connected", connected);
  if (subscribe) subscribe.hidden = !connected;
  if (help) help.hidden = !connected;
  monthView.hidden = !calendarAvailable;

  if (!calendarAvailable) {
    status.textContent = "Not connected";
    intro.textContent = parish
      ? (hasSubscriptionControls
        ? "Your parish has not connected its public calendar yet. Feast highlights are still available below."
        : "Your parish has not connected its public calendar yet.")
      : "Sign in and choose your home parish to load its connected calendar.";
    target.innerHTML = "";
    return;
  }

  const googleUrl = donorParishCalendarGoogleUrl(subscriptionUrl);
  if (copyButton) copyButton.dataset.subscriptionUrl = subscriptionUrl;
  if (subscribeButton && googleButton) {
    const platform = donorParishCalendarPlatform();
    const isAndroid = platform === "android";
    const subscribeLabel = subscribeButton.querySelector("[data-calendar-subscribe-label]");
    subscribeButton.href = isAndroid ? (googleUrl || subscriptionUrl) : subscriptionUrl.replace(/^https:/i, "webcal:");
    subscribeButton.target = isAndroid ? "_blank" : "";
    subscribeButton.rel = isAndroid ? "noopener" : "";
    if (subscribeLabel) subscribeLabel.textContent = isAndroid
      ? (googleUrl ? "Add to Google Calendar" : "Open calendar subscription")
      : "Add to phone calendar";
    googleButton.hidden = isAndroid || !googleUrl;
    if (googleUrl) googleButton.href = googleUrl;
  }

  status.textContent = connected
    ? (payload.unavailable ? "Published events · external calendar unavailable" : "Connected")
    : (events.length ? "Published events" : "Shared celebrations");
  intro.textContent = connected
    ? (payload.unavailable
      ? "AGAPAY events and meals are available below. The connected external calendar could not be refreshed right now."
      : (hasSubscriptionControls
        ? "Upcoming parish events, including published meals and registrations. Subscribe once and external calendar changes stay in sync."
        : "Events published by your parish for the selected week."))
    : (events.length
      ? "Events and meals published by your parish or its ministries. Select a listing to view details or register."
      : "Your church calendar is not connected, but directory celebrations are available in the month view.");

  const today = new Date();
  const defaultView = monthView.dataset.calendarDefaultView === "month" ? "month" : "week";
  const periodStart = defaultView === "month"
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : donorParishCalendarStartOfWeek(today);
  const periodEnd = defaultView === "month"
    ? new Date(today.getFullYear(), today.getMonth() + 1, 0)
    : new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 6);
  const periodStartKey = donorParishCalendarDateKey(periodStart);
  const periodEndKey = donorParishCalendarDateKey(periodEnd);
  donorParishCalendarView = {
    events,
    celebrations,
    viewMode:defaultView,
    periodDate:today,
    selectedDate:[...events.map(donorParishCalendarEventDateKey), ...celebrations.map(item => item.date)]
      .find(key => key >= periodStartKey && key <= periodEndKey) || donorParishCalendarDateKey(today),
    unavailable:Boolean(payload.unavailable)
  };
  renderDonorParishCalendarMonth();
}

function donorCalendarCelebrationRequestPath() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const navigationEnd = new Date(today.getTime() + 180 * 86400000);
  const end = new Date(navigationEnd.getFullYear(), navigationEnd.getMonth() + 1, 0);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return `/api/directory/member/milestones?from=${donorParishCalendarDateKey(start)}&days=${days}`;
}

async function copyDonorParishCalendarUrl(button) {
  const subscriptionUrl = donorParishCalendarSubscriptionUrl(button?.dataset?.subscriptionUrl);
  if (!subscriptionUrl) return;
  const originalContent = button.innerHTML;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(subscriptionUrl);
    } else {
      const field = document.createElement("textarea");
      field.value = subscriptionUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    button.textContent = "Link copied";
  } catch {
    window.prompt("Copy this calendar subscription link:", subscriptionUrl);
  } finally {
    window.setTimeout(() => { button.innerHTML = originalContent; }, 1800);
  }
}

async function loadDonorCalendarPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    renderDonorCalendarFeasts(null);
    renderDonorCalendarPrompts(null);
    renderDonorParishCalendar({}, null);
    loadDonorLiturgicalDay(null);
    return;
  }
  try {
    const [data, sacramentPayload, parishCalendarPayload, celebrationPayload] = await Promise.all([
      donorApi("/api/donor/dashboard"),
      donorApi("/api/donor/sacraments").catch(() => ({ requests:[] })),
      donorApi("/api/donor/parish-calendar").catch(() => ({ connected:false, events:[] })),
      donorApi(donorCalendarCelebrationRequestPath()).catch(() => ({ milestones:{ items:[] } }))
    ]);
    setDonorProfile(data.donor);
    renderDonorCalendarFeasts(data.parish || null);
    renderDonorCalendarPrompts(data.parish || null);
    renderDonorPersonalCalendar(sacramentPayload);
    renderDonorParishCalendar(parishCalendarPayload, data.parish || null, celebrationPayload.milestones || {});
    loadDonorLiturgicalDay(data.parish || null);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      renderDonorCalendarFeasts(null);
      renderDonorCalendarPrompts(null);
      renderDonorParishCalendar({}, null);
      loadDonorLiturgicalDay(null);
      return;
    }
    setDonorStatus(err.message, "error");
  }
}


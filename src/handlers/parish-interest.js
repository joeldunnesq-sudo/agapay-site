import {
  d1,
  d1SetSetting,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  sha256Hex,
  verifyTurnstileIfConfigured,
} from "../lib/core.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { htmlEscape } from "../lib/format.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function saveInterest(env, key, entry) {
  const value = JSON.stringify(entry);
  if (d1(env)) return d1SetSetting(env, key, value);
  return env.AGAPAY_REGISTRATIONS.put(key, value);
}

export async function handleParishInterest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-interest", { limit: 4, windowSeconds: 600 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot submissions receive a neutral response without creating outreach.
  if (text(body.organizationWebsite, 200)) return json({ ok: true, received: true }, { status: 202 });

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const parishionerName = text(body.parishionerName, 120);
  const parishionerEmail = normalizeEmail(body.parishionerEmail);
  const parishName = text(body.parishName, 180);
  const parishEmail = normalizeEmail(body.parishEmail);
  const city = text(body.city, 100);
  const state = text(body.state, 80);
  const jurisdiction = text(body.jurisdiction, 140);
  const website = text(body.parishWebsite, 240);
  const note = text(body.note, 1200);
  const shareName = body.shareName === true || body.shareName === "true" || body.shareName === "on";
  const consent = body.consent === true || body.consent === "true" || body.consent === "on";

  if (!parishionerName) return json({ error: "Enter your name." }, { status: 400 });
  if (!EMAIL_PATTERN.test(parishionerEmail)) return json({ error: "Enter your valid email address." }, { status: 400 });
  if (!parishName) return json({ error: "Enter the parish name." }, { status: 400 });
  if (!EMAIL_PATTERN.test(parishEmail)) return json({ error: "Enter a valid public parish email address." }, { status: 400 });
  if (!city || !state) return json({ error: "Enter the parish city and state or region." }, { status: 400 });
  if (!consent) return json({ error: "Confirm that you want AGAPAY to contact this parish." }, { status: 400 });
  if (website && !/^https?:\/\//i.test(website) && website.includes("://")) {
    return json({ error: "Enter a valid parish website." }, { status: 400 });
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const normalizedWebsite = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  const now = new Date().toISOString();
  const id = `interest_${await sha256Hex(`${parishEmail}:${parishionerEmail}`)}`;
  const key = `parish-interest:${id}`;
  const entry = {
    id,
    status: "received",
    parishionerName,
    parishionerEmail,
    parishName,
    parishEmail,
    city,
    state,
    jurisdiction,
    parishWebsite: normalizedWebsite,
    note,
    shareName,
    source: "find-parish",
    createdAt: now,
    updatedAt: now,
    userAgent: request.headers.get("user-agent") || "",
    referer: request.headers.get("referer") || "",
  };
  await saveInterest(env, key, entry);

  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const location = [city, state].filter(Boolean).join(", ");
  const requestorLine = shareName
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;"><strong>${htmlEscape(parishionerName)}</strong>, who identifies as part of your parish community, asked us to share this invitation.</p>`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A parishioner in your community asked us to share this invitation. Their identity and contact information have not been disclosed.</p>`;

  const outreachResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [parishEmail],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `A parishioner asked about AGAPAY Give for ${parishName}`,
    html: agapayEmailHtml(appUrl, "A Parishioner Would Like to Give with AGAPAY", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Dear ${htmlEscape(parishName)} leadership,</p>
      ${requestorLine}
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;"><strong>AGAPAY Give</strong> is an Orthodox-first giving platform for stewardship, recurring gifts, candles, memorials, commemorations, campaigns, and parish giving history.</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#171715;">AGAPAY can complement your current donation structure; your parish does not need to abandon the giving methods already serving your community.</p>
      <p style="margin:0 0 24px;"><a href="${htmlEscape(`${appUrl}/give`)}" style="display:inline-block;background:#061522;color:#FFFDF8;text-decoration:none;border-radius:7px;padding:12px 18px;font-weight:700;">Explore AGAPAY Give</a></p>
      <p style="margin:0;font-size:13px;line-height:1.65;color:#625D53;">This is a one-time message sent because a parishioner supplied this public parish contact address. Reply to this email if you would like details or prefer not to hear from AGAPAY again.</p>
    `),
    text: `Dear ${parishName} leadership,\n\nA parishioner in your community asked AGAPAY to let you know they would like the option to give through AGAPAY Give. AGAPAY is an Orthodox-first platform for stewardship, recurring gifts, candles, memorials, commemorations, campaigns, and giving history. It can complement your current donation structure.\n\nLearn more: ${appUrl}/give\n\nThis is a one-time message sent because a parishioner supplied this public parish contact address. Reply if you would like details or prefer not to hear from AGAPAY again.`,
  });

  const notifyTo = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const internalResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [notifyTo],
    reply_to: parishionerEmail,
    subject: `New parish interest: ${parishName}`,
    html: agapayEmailHtml(appUrl, "New Parish Interest", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A parishioner requested AGAPAY Give outreach.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;">
        <p style="margin:0 0 8px;"><strong>Parish:</strong> ${htmlEscape(parishName)} (${htmlEscape(location)})</p>
        <p style="margin:0 0 8px;"><strong>Jurisdiction:</strong> ${htmlEscape(jurisdiction || "Not provided")}</p>
        <p style="margin:0 0 8px;"><strong>Parish contact:</strong> ${htmlEscape(parishEmail)}</p>
        <p style="margin:0 0 8px;"><strong>Website:</strong> ${htmlEscape(normalizedWebsite || "Not provided")}</p>
        <p style="margin:0 0 8px;"><strong>Requested by:</strong> ${htmlEscape(parishionerName)} &lt;${htmlEscape(parishionerEmail)}&gt;</p>
        <p style="margin:0 0 8px;"><strong>Outreach status:</strong> ${htmlEscape(outreachResult.status)}</p>
        <p style="margin:0;"><strong>Note:</strong> ${htmlEscape(note || "None")}</p>
      </div>
    `),
    text: `New parish interest\n\nParish: ${parishName}\nLocation: ${location}\nJurisdiction: ${jurisdiction}\nParish email: ${parishEmail}\nWebsite: ${normalizedWebsite}\nRequested by: ${parishionerName} <${parishionerEmail}>\nOutreach status: ${outreachResult.status}\nNote: ${note}`,
  });

  const confirmationResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [parishionerEmail],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `Your AGAPAY request for ${parishName}`,
    html: agapayEmailHtml(appUrl, "Thank You for Inviting Your Parish", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Thank you, ${htmlEscape(parishionerName)}. We received your request for <strong>${htmlEscape(parishName)}</strong>.</p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#171715;">${outreachResult.status === "sent" ? "We sent the parish a respectful introduction to AGAPAY Give." : "Your request is saved, and the AGAPAY team will follow up with the parish contact."}</p>
    `),
    text: `Thank you, ${parishionerName}. We received your AGAPAY Give request for ${parishName}. ${outreachResult.status === "sent" ? "We sent the parish a respectful introduction." : "The AGAPAY team will follow up with the parish contact."}`,
  });

  const updated = {
    ...entry,
    status: outreachResult.status === "sent" ? "outreach_sent" : "follow_up_needed",
    outreachStatus: outreachResult.status,
    internalNotificationStatus: internalResult.status,
    confirmationStatus: confirmationResult.status,
    updatedAt: new Date().toISOString(),
  };
  await saveInterest(env, key, updated);

  return json({
    ok: true,
    id,
    outreachSent: outreachResult.status === "sent",
    message: outreachResult.status === "sent"
      ? "Thank you. We sent your parish a respectful introduction to AGAPAY Give."
      : "Thank you. Your request was saved for the AGAPAY team to follow up.",
  }, { status: 201 });
}

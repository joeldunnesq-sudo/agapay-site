import { htmlEscape } from "./format.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_VALIDATION_URL = "https://api.resend.com/domains?limit=1";
const RESEND_USER_AGENT = "AGAPAY/1.0";

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

export function agapayEmailHtml(appUrl, title, bodyHtml) {
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const markUrl = htmlEscape(`${baseUrl}/mark.png`);

  return `
    <div style="margin:0;padding:0;background:#F4F0E6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:660px;margin:0 auto;padding:28px 14px;">
        <div style="background:#FFFFFF;border:1px solid rgba(201,162,91,0.34);border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(6,21,34,0.14);">
          <div style="background:linear-gradient(120deg,#041427 0%,#07284A 58%,#0A365B 100%);padding:28px 30px;border-bottom:3px solid #C9A25B;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:64px;vertical-align:middle;">
                  <div style="width:56px;height:56px;display:grid;place-items:center;border:1px solid rgba(200,162,74,0.55);border-radius:50%;background:rgba(6,21,34,0.34);">
                    <img src="${markUrl}" alt="AGAPAY" width="50" height="50" style="display:block;width:50px;height:50px;object-fit:contain;" />
                  </div>
                </td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:500;color:#F7F1E3;letter-spacing:0.04em;">AGAPAY</div>
                  <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#D7B06A;font-weight:700;padding-top:7px;">Love how you give</div>
                </td>
              </tr>
            </table>
          </div>

          <div style="padding:34px 30px 30px;background:#FFFFFF;">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B58A3F;font-weight:700;margin-bottom:12px;">AGAPAY platform update</div>
            <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:500;color:#061522;">${htmlEscape(title)}</h1>
            ${bodyHtml}
            <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#171715;">In Christ,<br /><strong>AGAPAY Team</strong></p>
          </div>

          <div style="background:#F4F0E6;padding:18px 30px;border-top:1px solid rgba(201,162,91,0.28);">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#595959;">AGAPAY helps canonical Orthodox parishes, missions, monasteries, ministries, schools, and faithful families flourish through values-aligned financial technology. If you need help, reply to this email.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function resendSendingDomainFromWebsite(website) {
  const value = String(website || "").trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function getParishEmailCredentialStatus(env, parishId) {
  const db = database(env);
  const normalizedParishId = String(parishId || "").trim();
  if (!db || !normalizedParishId) return { configured: false, configuredAt: "" };
  try {
    const row = await db.prepare(`
      SELECT configured_at
      FROM parish_email_credentials
      WHERE parish_id = ?
    `).bind(normalizedParishId).first();
    return {
      configured: Boolean(row),
      configuredAt: String(row?.configured_at || ""),
    };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "parish_email_credential_status_unavailable",
      parishId: normalizedParishId,
      error: error?.message || String(error),
    }));
    return { configured: false, configuredAt: "" };
  }
}

export async function resolveResendApiKey(env, parishId) {
  const sharedKey = String(env.RESEND_API_KEY || "").trim();
  const db = database(env);
  const normalizedParishId = String(parishId || "").trim();
  if (!db || !normalizedParishId) return { apiKey: sharedKey, source: "shared" };
  try {
    const row = await db.prepare(`
      SELECT resend_api_key
      FROM parish_email_credentials
      WHERE parish_id = ?
    `).bind(normalizedParishId).first();
    const parishKey = String(row?.resend_api_key || "").trim();
    return parishKey
      ? { apiKey: parishKey, source: "parish" }
      : { apiKey: sharedKey, source: "shared" };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "parish_email_credential_lookup_failed",
      parishId: normalizedParishId,
      error: error?.message || String(error),
    }));
    return { apiKey: sharedKey, source: "shared" };
  }
}

export async function validateResendApiKey(apiKey, fetchImpl = fetch) {
  const normalized = String(apiKey || "").trim();
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(normalized)) {
    return { valid: false, reason: "Enter a valid Resend API key beginning with re_." };
  }
  try {
    const response = await fetchImpl(RESEND_DOMAINS_VALIDATION_URL, {
      headers: {
        Authorization: `Bearer ${normalized}`,
        Accept: "application/json",
        "User-Agent": RESEND_USER_AGENT,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { valid: true, permission: "full_access" };
    if (response.status === 401 && body?.name === "restricted_api_key") {
      return { valid: true, permission: "sending_access" };
    }
    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: "Resend rejected this API key." };
    }
    return { valid: false, retryable: response.status >= 500 || response.status === 429, reason: "Resend could not validate this API key right now." };
  } catch {
    return { valid: false, retryable: true, reason: "Resend could not be reached to validate this API key." };
  }
}

export async function sendEmail(env, message, options = {}) {
  const credentials = await resolveResendApiKey(env, options.parishId);
  if (!credentials.apiKey) return { status: "not_configured" };
  const outboundMessage = credentials.source === "parish" && options.parishFrom
    ? { ...message, from: options.parishFrom }
    : message;

  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": RESEND_USER_AGENT,
      },
      body: JSON.stringify(outboundMessage),
    });
    const bodyText = await response.text();
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = {}; }
    if (!response.ok) {
      return {
        status: "failed",
        httpStatus: response.status,
        body: bodyText,
        detail: body.message || body.error || "Email provider rejected the message",
      };
    }
    return { status: "sent", httpStatus: response.status, body: bodyText, id: body.id || "" };
  } catch (error) {
    return { status: "error", detail: error?.message || "Email request failed", error: error?.message || String(error) };
  }
}

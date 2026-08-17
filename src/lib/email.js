import { htmlEscape } from "./format.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const RESEND_USER_AGENT = "AGAPAY/1.0";

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

export async function sendEmail(env, message) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) return { status: "not_configured" };

  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": RESEND_USER_AGENT,
      },
      body: JSON.stringify(message),
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

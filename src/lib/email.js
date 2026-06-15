import { htmlEscape } from "./format.js";

export function agapayEmailHtml(appUrl, title, bodyHtml) {
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const markUrl = htmlEscape(`${baseUrl}/mark.png`);

  return `
    <div style="margin:0;padding:0;background:#F4F0E6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:660px;margin:0 auto;padding:28px 14px;">
        <div style="background:#FFFFFF;border:1px solid rgba(201,162,91,0.34);border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(6,21,34,0.14);">
          <div style="background:linear-gradient(120deg,#041427 0%,#07284A 58%,#0A365B 100%);padding:28px 30px;border-bottom:3px solid #C9A25B;">
            <img src="${markUrl}" alt="AGAPAY" width="46" height="46" style="display:block;margin:0 0 14px;" />
            <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#D7B86B;font-weight:700;">AGAPAY</div>
            <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1;color:#FFFFFF;font-weight:500;">${htmlEscape(title)}</h1>
          </div>
          <div style="padding:30px;color:#1F2937;font-size:15px;line-height:1.7;">
            ${bodyHtml}
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
  if (!env.RESEND_API_KEY) return { status: "not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const body = await response.text();
    if (!response.ok) {
      return { status: "failed", httpStatus: response.status, body };
    }
    return { status: "sent", httpStatus: response.status, body };
  } catch (error) {
    return { status: "error", error: error?.message || String(error) };
  }
}

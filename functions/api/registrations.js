import { json, requireFields } from "../_shared/http.js";

const requiredFields = [
  "communityType",
  "parishName",
  "jurisdiction",
  "city",
  "state",
  "priestFirst",
  "priestEmail",
  "priestPhone",
  "treasurerFirst",
  "treasurerEmail"
];

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = requireFields(body, requiredFields);
  if (missing.length) {
    return json({ error: "Missing required fields", fields: missing }, { status: 422 });
  }

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@")) {
    return json({ error: "A valid priest and treasurer email are required" }, { status: 422 });
  }

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`;
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body
  };

  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
  }

  return json(
    {
      ok: true,
      reference,
      mode: env.AGAPAY_REGISTRATIONS ? "stored" : "demo",
      message: "Registration received. AgaPay will review the parish before activation."
    },
    { status: 201 }
  );
}

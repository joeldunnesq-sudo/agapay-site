import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { handleOptions, readJson, requireFields, sendJson } from "../lib/http.js";

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

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const missing = requireFields(body, requiredFields);
  if (missing.length) return sendJson(res, 422, { error: "Missing required fields", fields: missing });

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@")) {
    return sendJson(res, 422, { error: "A valid priest and treasurer email are required" });
  }

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`;
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body
  };

  const registrationsDir = path.join(process.cwd(), "data", "registrations");
  await mkdir(registrationsDir, { recursive: true });
  await writeFile(path.join(registrationsDir, `${reference}.json`), JSON.stringify(registration, null, 2));

  sendJson(res, 201, {
    ok: true,
    reference,
    message: "Registration received. AgaPay will review the parish before activation."
  });
}

import { listParishes } from "../lib/parishes.js";
import { handleOptions, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const parishes = await listParishes();
  sendJson(res, 200, {
    parishes: parishes.map(({ stripeAccountId, ...publicParish }) => publicParish)
  });
}

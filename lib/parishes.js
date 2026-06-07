import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const fallbackParishes = [
  {
    id: "st-seraphim-mission",
    name: "St. Seraphim of Sarov Mission",
    city: "Tulsa",
    state: "OK",
    jurisdiction: "ROCOR",
    status: "verified",
    givingStatus: "active",
    funds: [
      { id: "general", name: "General Operating Fund", description: "Utilities, supplies, ministries, and day-to-day parish needs." },
      { id: "building", name: "Building Fund", description: "Long-term property, repairs, and parish growth." }
    ],
    campaigns: []
  },
  {
    id: "holy-theotokos-skete",
    name: "Holy Theotokos Skete",
    city: "Springfield",
    state: "MO",
    jurisdiction: "OCA",
    status: "verified",
    givingStatus: "active",
    funds: [
      { id: "general", name: "General Support", description: "Daily monastery needs and hospitality." }
    ],
    campaigns: []
  }
];

function slugify(value) {
  return String(value || "parish")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "parish";
}

function parishFromRegistration(registration) {
  if (!registration || registration.status !== "verified") return null;
  const givingStatus = String(registration.givingStatus || "active").toLowerCase();
  if (["hidden", "paused", "inactive"].includes(givingStatus)) return null;
  const id = registration.parishId || slugify(registration.parishName);
  return {
    id,
    name: registration.parishName || id,
    city: registration.city || "",
    state: registration.state || "",
    jurisdiction: registration.jurisdiction || "",
    status: registration.status,
    givingStatus,
    funds: Array.isArray(registration.funds) ? registration.funds : fallbackParishes[0].funds,
    campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
    stripeAccountId: registration.stripeAccountId || ""
  };
}

async function registeredParishes() {
  const registrationsDir = path.join(process.cwd(), "data", "registrations");
  let files;
  try {
    files = await readdir(registrationsDir);
  } catch {
    return [];
  }

  const parishes = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const registration = JSON.parse(await readFile(path.join(registrationsDir, file), "utf8"));
      const parish = parishFromRegistration(registration);
      if (parish) parishes.push(parish);
    } catch {
      // Ignore malformed local registration fixtures.
    }
  }
  return parishes;
}

export async function listParishes() {
  const registered = await registeredParishes();
  const byId = new Map(fallbackParishes.map((parish) => [parish.id, parish]));
  for (const parish of registered) byId.set(parish.id, parish);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findParish(parishId) {
  const id = String(parishId || "").trim();
  if (!id) return null;
  return (await listParishes()).find((parish) => parish.id === id) || null;
}

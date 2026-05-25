import { readFile } from "node:fs/promises";
import path from "node:path";

const dataPath = path.join(process.cwd(), "data", "parishes.json");

export async function listParishes() {
  const raw = await readFile(dataPath, "utf8");
  return JSON.parse(raw);
}

export async function findParish(id) {
  const parishes = await listParishes();
  return parishes.find((parish) => parish.id === id);
}

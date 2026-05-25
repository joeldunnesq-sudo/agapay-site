import { json } from "../_shared/http.js";
import { publicParishes } from "../_shared/parishes.js";

export async function onRequestGet() {
  return json({ parishes: publicParishes() });
}

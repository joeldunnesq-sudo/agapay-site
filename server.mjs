import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8"
};

async function handleApi(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const name = pathname.replace(/^\/api\//, "");
  const modulePath = path.join(root, "api", `${name}.js`);
  if (!existsSync(modulePath)) return false;
  const mod = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
  await mod.default(req, res);
  return true;
}

function resolveStaticPath(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/donor" || pathname === "/donor/") pathname = "/donor/index.html";
  if (!path.extname(pathname)) pathname = `${pathname}.html`;
  if (pathname.startsWith("/give/") && !existsSync(path.join(publicDir, pathname))) {
    pathname = "/give/st-seraphim-mission.html";
  }
  return path.normalize(path.join(publicDir, pathname));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/") && await handleApi(req, res)) return;

    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    const filePath = resolveStaticPath(pathname);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`AgaPay dev server running at http://localhost:${port}`);
});

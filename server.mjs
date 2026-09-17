import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(fileURLToPath(new URL("./dist/", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 4175);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const safePath = normalize(requested).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath || "index.html");
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }
  response.writeHead(200, {
    "Content-Type": mime[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`ScaleSketch ready at http://127.0.0.1:${port}`);
});

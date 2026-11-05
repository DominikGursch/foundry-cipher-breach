import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html": "text/html", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.writeHead(302, { Location: "/preview/" }).end();
    return;
  }
  const name = pathname === "/preview/" ? "preview/index.html" : pathname.slice(1);
  if (!/^(preview|scripts|styles|lang)\/[A-Za-z0-9_-]+\.(html|mjs|css|json)$/.test(name)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const bytes = await readFile(path.join(root, name));
    response.writeHead(200, { "Content-Type": `${types[path.extname(name)]}; charset=utf-8` }).end(bytes);
  } catch (error) {
    if (error.code === "ENOENT") response.writeHead(404).end("Not found");
    else {
      console.error("Cipher Breach preview server |", error);
      response.writeHead(500).end("Preview server error");
    }
  }
});
server.listen(Number(process.env.PORT ?? 8080), "127.0.0.1", () => {
  console.log(`Cipher Breach preview: http://127.0.0.1:${server.address().port}/preview/`);
});

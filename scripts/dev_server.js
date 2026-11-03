const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "public");
const port = Number(process.env.PORT || 4173);

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const requested = path.normalize(pathname === "/" ? "/index.html" : pathname).replace(/^[/\\]+/, "");
  let file = path.join(ROOT, requested);
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".csv": "text/csv" };
    response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    response.end(data);
  });
}).listen(port, () => console.log(`Server running at http://localhost:${port}`));

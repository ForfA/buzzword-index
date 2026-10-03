import http from "node:http";

// Starts a throwaway HTTP server on a random port. `handler` gets the parsed
// JSON body (or null) and returns { status, headers, body }.
export async function mockServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
    requests.push(request);
    const { status = 200, headers = { "content-type": "application/json" }, body = "" } = await handler(request);
    res.writeHead(status, headers);
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(r)) };
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const worker = readFileSync("scripts/service-worker.js", "utf8");
function harness(network: (request: unknown) => Promise<unknown>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const downloaded: string[] = [];
  const shell = new Response("Offline shell");
  const cache = {
    addAll: async (paths: string[]) => {
      downloaded.push(...paths);
    },
    match: async () =>
      new Response('<script src="/_next/static/main.js"></script>'),
    put: async () => {},
  };
  runInNewContext(worker, {
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      match: async () => shell,
      keys: async () => [],
      delete: async () => true,
    },
    URL,
    Response,
    fetch: network,
  });
  return { handlers, downloaded };
}
describe("offline app shell", () => {
  it("downloads the complete build manifest, including sections not yet opened", async () => {
    const { handlers, downloaded } = harness(
      async () =>
        new Response(
          JSON.stringify([
            "/_next/static/giro.js",
            "/_next/static/assistant.js",
          ]),
        ),
    );
    let work!: Promise<unknown>;
    handlers.install({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
    expect(downloaded).toContain("/_next/static/assistant.js");
    expect(downloaded).toContain("/");
  });
  it("can reopen the app offline and keeps public shared links out of the app fallback", async () => {
    const { handlers } = harness(async () => {
      throw new Error("Offline");
    });
    const get = async (path: string) => {
      let response!: Promise<Response>;
      handlers.fetch({
        request: {
          method: "GET",
          url: `https://example.com${path}`,
          mode: "navigate",
          headers: new Headers(),
        },
        respondWith: (promise: Promise<Response>) => {
          response = promise;
        },
      });
      return (await response).text();
    };
    expect(await get("/")).toBe("Offline shell");
    expect(await get("/share/token")).toContain(
      "Questo link richiede Internet",
    );
  });
  it("does not cache API responses", () => {
    const { handlers } = harness(async () => new Response("private"));
    let handled = false;
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.com/api/share/token",
        mode: "cors",
        headers: new Headers(),
      },
      respondWith: () => {
        handled = true;
      },
    });
    expect(handled).toBe(false);
  });
});

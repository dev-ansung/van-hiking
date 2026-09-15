import test from "node:test";
import assert from "node:assert/strict";
import worker from "../api/src/index.js";

function createMockDB(rows = []) {
  return {
    prepare() {
      const stmt = {
        bind() {
          return stmt;
        },
        async all() {
          return { results: rows };
        },
        async first() {
          return rows[0] ?? null;
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
    async exec() {},
  };
}

test("GET /health returns ok when DB binding is healthy", async () => {
  const res = await worker.fetch(
    new Request("https://vanhiking-api.ansung.dev/health"),
    { DB: createMockDB([{ ok: 1 }]) }
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("POST /hikes fails closed (401) when GATE_PASSWORD is unset or wrong", async () => {
  const reqNoAuth = new Request("https://vanhiking-api.ansung.dev/hikes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: "fb-changqing", hike_date: "2026-11-20", route: "Test" }),
  });

  const resUnset = await worker.fetch(reqNoAuth, { DB: createMockDB() });
  assert.equal(resUnset.status, 401);

  const reqWrong = new Request("https://vanhiking-api.ansung.dev/hikes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer wrong-secret",
    },
    body: JSON.stringify({ account_id: "fb-changqing", hike_date: "2026-11-20", route: "Test" }),
  });

  const resWrong = await worker.fetch(reqWrong, {
    DB: createMockDB(),
    GATE_PASSWORD: "correct-secret",
  });
  assert.equal(resWrong.status, 401);
});

test("POST /hikes validates required fields (400) when authorized", async () => {
  const req = new Request("https://vanhiking-api.ansung.dev/hikes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-secret",
    },
    body: JSON.stringify({ account_id: "fb-changqing" }),
  });

  const res = await worker.fetch(req, {
    DB: createMockDB(),
    GATE_PASSWORD: "test-secret",
  });
  assert.equal(res.status, 400);
});

test("GET /openapi.json returns valid OpenAPI 3.0 spec with /hikes and /posts/:id", async () => {
  const res = await worker.fetch(
    new Request("https://vanhiking-api.ansung.dev/openapi.json"),
    { DB: createMockDB() }
  );
  assert.equal(res.status, 200);
  const spec = await res.json();
  assert.equal(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/hikes"]);
  assert.ok(spec.paths["/posts/{id}"]);
});

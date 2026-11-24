import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllHikes, fetchAllSnapshots } from "../lib/api.js";

test("fetchAllHikes paginates with limit=100 until total is reached", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.includes("offset=0")) {
      return {
        ok: true,
        json: async () => ({
          total: 3,
          hikes: [{ id: 1 }, { id: 2 }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        total: 3,
        hikes: [{ id: 3 }],
      }),
    };
  };

  const hikes = await fetchAllHikes("fb-changqing", fakeFetch);
  assert.equal(hikes.length, 3);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /limit=100&offset=0/);
  assert.match(calls[1], /limit=100&offset=2/);
});

test("fetchAllSnapshots paginates until total is reached", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("offset=0")) {
      return {
        ok: true,
        json: async () => ({
          total: 2,
          snapshots: [{ date: "2026-01-01" }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        total: 2,
        snapshots: [{ date: "2026-01-02" }],
      }),
    };
  };

  const snapshots = await fetchAllSnapshots("fb-changqing", fakeFetch);
  assert.equal(snapshots.length, 2);
});

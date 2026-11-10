import { describe, expect, test, afterAll } from "bun:test";
import { startForgeServer } from "../src/server.ts";

describe("Sovereign Forge Server Endpoints", () => {
  const testPort = 4123;
  const server = startForgeServer(testPort);

  afterAll(() => {
    server.stop();
  });

  test("GET / serves HTML dashboard", async () => {
    const res = await fetch(`http://localhost:${testPort}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("SOVEREIGN FORGE");
  });

  test("GET /api/health returns healthy status", async () => {
    const res = await fetch(`http://localhost:${testPort}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.engine).toContain("FRG");
  });

  test("GET /api/repos returns repository list", async () => {
    const res = await fetch(`http://localhost:${testPort}/api/repos`);
    expect(res.status).toBe(200);
    const repos = await res.json();
    expect(Array.isArray(repos)).toBe(true);
    expect(repos.length).toBeGreaterThan(0);
  }, 15000);

  test("GET and POST /api/reviews handles review lifecycle", async () => {
    const postRes = await fetch(`http://localhost:${testPort}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoName: "vcs/forge",
        title: "API Endpoint Test Review",
        description: "Testing API",
        targetBranch: "main",
        sourceCommit: "HEAD",
        author: "tester",
      }),
    });
    expect(postRes.status).toBe(201);
    const rev = await postRes.json();
    expect(rev.id).toBeDefined();

    const getRes = await fetch(`http://localhost:${testPort}/api/reviews`);
    const reviews = await getRes.json();
    expect(reviews.some((r: any) => r.id === rev.id)).toBe(true);
  });
});

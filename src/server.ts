// Sovereign Monorepo Forge: Web Dashboard & REST API Engine (Bun.serve)
import { scanMonorepoRepos, getRepoStacks, getRepoDiff, slimRepo, inspectRepo } from "./vcs.ts";
import {
  createReview,
  listReviews,
  updateReviewStatus,
  listCIRuns,
  listBundles,
  storeBundle,
  getBundle,
} from "./db.ts";
import { executeCIRun } from "./ci.ts";
import { createPatchBundle, applyPatchBundle } from "./vcs.ts";
import type { PatchBundle } from "./types.ts";

function renderHtmlDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FRG // Sovereign Monorepo Forge</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12151f;
      --border: #1e2438;
      --accent: #3b82f6;
      --text: #e2e8f0;
      --text-dim: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --purple: #8b5cf6;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      font-family: var(--mono);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
      border: 1px solid rgba(59, 130, 246, 0.3);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge.success { background: rgba(16, 185, 129, 0.15); color: var(--success); border-color: rgba(16, 185, 129, 0.3); }
    .badge.warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); border-color: rgba(245, 158, 11, 0.3); }
    .badge.purple { background: rgba(139, 92, 246, 0.15); color: var(--purple); border-color: rgba(139, 92, 246, 0.3); }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .stat-title {
      font-size: 12px;
      color: var(--text-dim);
      text-transform: uppercase;
      margin-bottom: 6px;
      font-family: var(--mono);
    }
    .stat-val {
      font-size: 24px;
      font-weight: 700;
      font-family: var(--mono);
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
      background: var(--card-bg);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    th {
      background: rgba(255, 255, 255, 0.02);
      font-family: var(--mono);
      font-size: 12px;
      color: var(--text-dim);
    }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: var(--mono); }
    .btn {
      background: #1e293b;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--mono);
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--accent);
      border-color: var(--accent);
    }
    .btn-sm { padding: 4px 8px; font-size: 11px; }
    .panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    @media (max-width: 900px) { .panels { grid-template-columns: 1fr; } }
    .panel {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .stack-node {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-left: 2px solid var(--accent);
      background: rgba(255, 255, 255, 0.01);
      margin-bottom: 8px;
      font-family: var(--mono);
      font-size: 12px;
    }
    .stack-node.working { border-left-color: var(--success); }
    .diff-box {
      background: #050608;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      font-family: var(--mono);
      font-size: 11px;
      max-height: 250px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1 style="font-size: 20px; font-weight: 700;">FRG // SOVEREIGN FORGE</h1>
      <span class="badge purple">Jujutsu + Gitoxide</span>
      <span class="badge">Pure Bun 1.4.4</span>
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <span class="badge success">Node: APHRODY-WIN32</span>
      <span class="badge">Mesh: fr1 / fr2 / usa / omr</span>
      <button class="btn btn-sm" onclick="location.reload()">Refresh</button>
    </div>
  </header>

  <div class="grid-stats">
    <div class="stat-card">
      <div class="stat-title">Managed Repos</div>
      <div class="stat-val" id="stat-repos">...</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Pristine Working Copies</div>
      <div class="stat-val" style="color: var(--success);" id="stat-clean">...</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Local Reviews</div>
      <div class="stat-val" style="color: var(--purple);" id="stat-reviews">...</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">CI Runs</div>
      <div class="stat-val" id="stat-ci">...</div>
    </div>
  </div>

  <div class="section-title">Monorepo Active Repositories (C:\\src)</div>
  <table id="repos-table">
    <thead>
      <tr>
        <th>Repository</th>
        <th>Branch</th>
        <th>Head Commit</th>
        <th>Status</th>
        <th>Engine</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="repos-body">
      <tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Scanning repositories...</td></tr>
    </tbody>
  </table>

  <div class="panels">
    <div class="panel">
      <div class="section-title" style="justify-content: space-between;">
        <span>Jujutsu Stacked Commits (jj)</span>
        <select id="repo-select" class="btn btn-sm" onchange="loadStacks(this.value)">
          <option value="">Select repo...</option>
        </select>
      </div>
      <div id="stacks-container">
        <p style="color: var(--text-dim); font-size: 13px;">Select a repository to view conflict-free stacked changes.</p>
      </div>
    </div>

    <div class="panel">
      <div class="section-title" style="justify-content: space-between;">
        <span>Sovereign Local Reviews</span>
        <button class="btn btn-sm" onclick="promptNewReview()">+ New Review</button>
      </div>
      <div id="reviews-container">
        <p style="color: var(--text-dim); font-size: 13px;">Loading local reviews...</p>
      </div>
    </div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="section-title">Local CI Pipeline (Zero GitHub Actions Overhead)</div>
      <div id="ci-container">
        <p style="color: var(--text-dim); font-size: 13px;">Loading CI status...</p>
      </div>
    </div>

    <div class="panel">
      <div class="section-title">Content-Addressed Blake3/Zstd Bundle Exchange</div>
      <div id="bundles-container">
        <p style="color: var(--text-dim); font-size: 13px;">Loading synchronized bundles...</p>
      </div>
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const [reposRes, reviewsRes, ciRes, bundlesRes] = await Promise.all([
          fetch('/api/repos').then(r => r.json()),
          fetch('/api/reviews').then(r => r.json()),
          fetch('/api/ci').then(r => r.json()),
          fetch('/api/bundles').then(r => r.json())
        ]);

        document.getElementById('stat-repos').innerText = reposRes.length;
        document.getElementById('stat-clean').innerText = reposRes.filter(r => r.isClean).length;
        document.getElementById('stat-reviews').innerText = reviewsRes.length;
        document.getElementById('stat-ci').innerText = ciRes.length;

        const tbody = document.getElementById('repos-body');
        const repoSelect = document.getElementById('repo-select');
        tbody.innerHTML = '';
        repoSelect.innerHTML = '<option value="">Select repo...</option>';

        reposRes.forEach(repo => {
          const opt = document.createElement('option');
          opt.value = repo.path;
          opt.innerText = repo.name;
          repoSelect.appendChild(opt);

          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td style="font-weight: 600;">\${repo.name}</td>
            <td class="mono" style="color: var(--accent);">\${repo.branch}</td>
            <td class="mono" title="\${repo.headMessage}">\${repo.headCommit.substring(0, 8)}</td>
            <td>
              <span class="badge \${repo.isClean ? 'success' : 'warning'}">
                \${repo.isClean ? 'Clean' : repo.modifiedFiles + ' mod / ' + repo.untrackedFiles + ' untr'}
              </span>
            </td>
            <td>
              \${repo.hasJj ? '<span class="badge purple">jj</span>' : '<span class="badge">git</span>'}
            </td>
            <td>
              <button class="btn btn-sm" onclick="triggerSlim('\${repo.path}')">Slim</button>
            </td>
          \`;
          tbody.appendChild(tr);
        });

        if (reposRes.length > 0) {
          repoSelect.value = reposRes[0].path;
          loadStacks(reposRes[0].path);
        }

        renderReviews(reviewsRes);
        renderCI(ciRes);
        renderBundles(bundlesRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    async function loadStacks(repoPath) {
      if (!repoPath) return;
      const container = document.getElementById('stacks-container');
      container.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">Reading working-copy commits...</p>';
      try {
        const stacks = await fetch('/api/stacks?repo=' + encodeURIComponent(repoPath)).then(r => r.json());
        if (stacks.length === 0) {
          container.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">No stack history found.</p>';
          return;
        }
        container.innerHTML = stacks.map(s => \`
          <div class="stack-node \${s.isWorkingCopy ? 'working' : ''}">
            <span style="color: \${s.isWorkingCopy ? 'var(--success)' : 'var(--accent)'}; font-weight: bold;">
              \${s.isWorkingCopy ? '@ (wc)' : '◆'}
            </span>
            <span style="color: var(--purple);">\${s.changeId}</span>
            <span style="color: var(--text-dim);">[\${s.commitSha.substring(0, 7)}]</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${s.description}</span>
            <span style="font-size: 11px; color: var(--text-dim);">\${s.author}</span>
          </div>
        \`).join('');
      } catch (e) {
        container.innerHTML = '<p style="color: var(--danger);">Failed to load stacks.</p>';
      }
    }

    function renderReviews(reviews) {
      const c = document.getElementById('reviews-container');
      if (reviews.length === 0) {
        c.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">No pending code reviews.</p>';
        return;
      }
      c.innerHTML = reviews.map(r => \`
        <div style="border-bottom: 1px solid var(--border); padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600; font-size: 13px;">#\${r.id}: \${r.title}</div>
            <div style="font-size: 11px; color: var(--text-dim); font-family: var(--mono);">
              \${r.repo_name} &bull; target: \${r.target_branch} &bull; \${r.author}
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <span class="badge \${r.status === 'approved' ? 'success' : 'warning'}">\${r.status}</span>
            \${r.status === 'pending' ? \`<button class="btn btn-sm" onclick="approveReview(\${r.id})">Approve</button>\` : ''}
          </div>
        </div>
      \`).join('');
    }

    function renderCI(runs) {
      const c = document.getElementById('ci-container');
      if (runs.length === 0) {
        c.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">No CI runs recorded.</p>';
        return;
      }
      c.innerHTML = runs.slice(0, 5).map(run => \`
        <div style="border-bottom: 1px solid var(--border); padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="badge \${run.status === 'success' ? 'success' : 'danger'}">\${run.status}</span>
            <span class="mono" style="margin-left: 8px; font-size: 12px;">\${run.repo_name} &bull; \${run.command}</span>
          </div>
          <span class="mono" style="font-size: 11px; color: var(--text-dim);">\${run.duration_ms}ms</span>
        </div>
      \`).join('');
    }

    function renderBundles(bundles) {
      const c = document.getElementById('bundles-container');
      if (bundles.length === 0) {
        c.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">No bundles created yet.</p>';
        return;
      }
      c.innerHTML = bundles.slice(0, 5).map(b => \`
        <div style="border-bottom: 1px solid var(--border); padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="mono" style="color: var(--purple); font-size: 12px;">\${b.hash.substring(0, 12)}</span>
            <span style="margin-left: 8px; font-size: 12px;">\${b.repo_name}</span>
          </div>
          <span class="mono" style="font-size: 11px; color: var(--text-dim);">
            \${b.raw_bytes}B &rarr; \${b.compressed_bytes}B (Zstd)
          </span>
        </div>
      \`).join('');
    }

    async function promptNewReview() {
      const title = prompt('Review Title:');
      if (!title) return;
      const repo = prompt('Repository Name (e.g. vcs/forge):');
      if (!repo) return;
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: repo,
          title,
          description: 'Sovereign stack review',
          targetBranch: 'main',
          sourceCommit: 'HEAD',
          author: 'aphrody-dev'
        })
      });
      loadData();
    }

    async function approveReview(id) {
      await fetch('/api/reviews/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      });
      loadData();
    }

    async function triggerSlim(repoPath) {
      const res = await fetch('/api/slim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath })
      }).then(r => r.json());
      alert('Slimmed: Saved ' + (res.savedBytes || 0) + ' bytes!');
      loadData();
    }

    loadData();
  </script>
</body>
</html>`;
}

export function startForgeServer(port: number = 4000) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        return new Response(renderHtmlDashboard(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/health") {
        return Response.json({
          status: "healthy",
          engine: "FRG Sovereign Forge",
          runtime: `Bun ${Bun.version}`,
          vcs: ["jj", "gix", "git"],
          timestamp: new Date().toISOString(),
        });
      }

      if (url.pathname === "/api/repos") {
        const repos = scanMonorepoRepos("C:\\src");
        return Response.json(repos);
      }

      if (url.pathname === "/api/stacks") {
        const repoPath = url.searchParams.get("repo");
        if (!repoPath) return Response.json([]);
        const stacks = getRepoStacks(repoPath);
        return Response.json(stacks);
      }

      if (url.pathname === "/api/diff") {
        const repoPath = url.searchParams.get("repo");
        const commit = url.searchParams.get("commit") || undefined;
        if (!repoPath) return new Response("Missing repo", { status: 400 });
        const diff = getRepoDiff(repoPath, commit);
        return new Response(diff, { headers: { "Content-Type": "text/plain" } });
      }

      if (url.pathname === "/api/reviews") {
        if (req.method === "GET") {
          const repo = url.searchParams.get("repo") || undefined;
          return Response.json(listReviews(repo));
        }
        if (req.method === "POST") {
          const body = await req.json();
          const rev = createReview(body);
          return Response.json(rev, { status: 201 });
        }
      }

      if (url.pathname.startsWith("/api/reviews/") && req.method === "PATCH") {
        const id = parseInt(url.pathname.split("/").pop() || "0", 10);
        const body = await req.json();
        const success = updateReviewStatus(id, body.status);
        return Response.json({ success });
      }

      if (url.pathname === "/api/ci") {
        if (req.method === "GET") {
          const repo = url.searchParams.get("repo") || undefined;
          return Response.json(listCIRuns(repo));
        }
        if (req.method === "POST") {
          const body = await req.json();
          const run = await executeCIRun(body.repoName, body.repoPath, body.command);
          return Response.json(run, { status: 201 });
        }
      }

      if (url.pathname === "/api/slim" && req.method === "POST") {
        const body = await req.json();
        const result = slimRepo(body.repoPath);
        return Response.json(result);
      }

      if (url.pathname === "/api/bundles") {
        if (req.method === "GET") {
          return Response.json(listBundles());
        }
        if (req.method === "POST") {
          const body = (await req.json()) as PatchBundle;
          const ok = storeBundle(body);
          return Response.json({ success: ok, hash: body.header.hash }, { status: 201 });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[FRG Forge] Server running on http://localhost:${server.port}`);
  return server;
}

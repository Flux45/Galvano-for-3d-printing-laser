import express from "express";
import { createServer as createViteServer } from "vite";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);
const PORT = 3000;
const REPO_SLUG = "Flux45/Galvano-for-3d-printing-laser";
const PAGES_URL = "https://flux45.github.io/Galvano-for-3d-printing-laser/";

async function runGit(args: string[], cwd = process.cwd()): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/github/status", async (_req, res) => {
    try {
      const { stdout: lastCommit } = await runGit(["log", "-1", "--format=%h — %s (%cr)"]);
      const { stdout: branch } = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      const { stdout: statusOut } = await runGit(["status", "-s"]);
      const hasEnvToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

      res.json({
        ok: true,
        repo: REPO_SLUG,
        pagesUrl: PAGES_URL,
        branch: branch.trim() || "main",
        lastCommit: lastCommit.trim(),
        uncommittedChanges: statusOut.trim().split("\n").filter(Boolean).length,
        hasEnvToken,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post("/api/github/push", async (req, res) => {
    const logs: string[] = [];
    try {
      const commitMessage =
        req.body?.commitMessage ||
        "feat: update GalvoForge with 4-axis DIY stepper CAD, linear laser focus, descending Z-bed, and 2-opt optimizer";
      const updateGhPages = req.body?.updateGhPages !== false;

      await runGit(["config", "user.email", "aayyuusshh.45@gmail.com"]);
      await runGit(["config", "user.name", "Flux45"]);

      // Stage any recent changes
      await runGit([
        "add",
        ".github",
        "public",
        "src",
        "index.html",
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "README.md",
        "metadata.json",
      ]);

      const { stdout: statusOut } = await runGit(["status", "--porcelain"]);
      if (statusOut.trim().length > 0) {
        await runGit(["commit", "-m", commitMessage]);
        logs.push(`Committed latest workspace changes: "${commitMessage}"`);
      } else {
        logs.push("Workspace is clean; using latest commit on main.");
      }

      // Refresh downloadable patch file
      const { stdout: patchContent } = await runGit(["format-patch", "-1", "HEAD", "--stdout"]);
      fs.writeFileSync(path.join(process.cwd(), "public", "galvoforge-prototype-integration.patch"), patchContent);
      logs.push("Updated public/galvoforge-prototype-integration.patch.");

      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const remoteUrl = token
        ? `https://x-access-token:${token}@github.com/${REPO_SLUG}.git`
        : `https://github.com/${REPO_SLUG}.git`;

      // Attempt push to main
      await runGit(["push", remoteUrl, "HEAD:main"]);
      logs.push(`Pushed main branch to https://github.com/${REPO_SLUG} (triggers GitHub Pages workflow).`);

      if (updateGhPages) {
        await execFileAsync("npx", ["vite", "build"], { cwd: process.cwd() });
        logs.push("Built production bundle in ./dist for GitHub Pages.");

        const tmpGhPages = "/tmp/galvo-gh-pages-deploy";
        fs.rmSync(tmpGhPages, { recursive: true, force: true });
        fs.cpSync(path.join(process.cwd(), "dist"), tmpGhPages, { recursive: true });
        await runGit(["init"], tmpGhPages);
        await runGit(["config", "user.email", "aayyuusshh.45@gmail.com"], tmpGhPages);
        await runGit(["config", "user.name", "Flux45"], tmpGhPages);
        await runGit(["checkout", "-b", "gh-pages"], tmpGhPages);
        await runGit(["add", "-A"], tmpGhPages);
        await runGit(["commit", "-m", "deploy: update GitHub Pages live site"], tmpGhPages);
        await runGit(["push", "--force", remoteUrl, "gh-pages:gh-pages"], tmpGhPages);
        fs.rmSync(tmpGhPages, { recursive: true, force: true });
        logs.push(`Force-pushed compiled ./dist to gh-pages branch (${PAGES_URL}).`);
      }

      res.json({
        ok: true,
        logs,
        pagesUrl: PAGES_URL,
      });
    } catch (err: any) {
      const errMsg = err.stderr || err.message || String(err);
      logs.push(`Push notice: ${errMsg.trim()}`);
      res.status(200).json({
        ok: false,
        needsAuth:
          errMsg.includes("could not read Username") ||
          errMsg.includes("Authentication failed") ||
          errMsg.includes("403"),
        error: errMsg.trim(),
        logs,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GalvoForge server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

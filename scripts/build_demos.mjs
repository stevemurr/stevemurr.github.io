import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const demosRoot = path.join(repoRoot, "external", "marriage-composer");
const outputRoot = path.join(repoRoot, "static", "demos");
const manifestPath = path.join(demosRoot, "demo-manifest.json");
const isProduction = process.env.NODE_ENV === "production" || process.env.HUGO_ENVIRONMENT === "production";

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validateDemo(demo) {
  if (!demo || typeof demo !== "object") {
    throw new Error("Each demo manifest entry must be an object.");
  }

  const slug = String(demo.slug || "").trim();
  const entry = String(demo.entry || "").trim();
  const title = String(demo.title || titleFromSlug(slug)).trim();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Invalid demo slug: ${slug}`);
  }

  if (!entry || entry.startsWith("/") || entry.includes("..")) {
    throw new Error(`Invalid demo entry for ${slug}: ${entry}`);
  }

  return { slug, entry, title };
}

async function loadManifestDemos() {
  if (!(await pathExists(manifestPath))) {
    return [];
  }

  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.demos)) {
    throw new Error(`Expected ${manifestPath} to contain a demos array.`);
  }

  return parsed.demos.map(validateDemo);
}

async function discoverConventionDemos() {
  const entries = await fs.readdir(demosRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".jsx") || name.endsWith(".tsx"))
    .sort()
    .map((name) => {
      const slug = path.basename(name, path.extname(name));
      return validateDemo({ slug, entry: name, title: titleFromSlug(slug) });
    });
}

async function loadDemos() {
  const manifestDemos = await loadManifestDemos();
  if (manifestDemos.length > 0) {
    return manifestDemos;
  }

  return discoverConventionDemos();
}

function wrapperSource(entry) {
  const importPath = `./external/marriage-composer/${entry.replaceAll(path.sep, "/")}`;

  return `
import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(importPath)};

const mountNode = document.getElementById("root");
const root = createRoot(mountNode);

let rafToken = 0;
let lastHeight = 0;

const readHeight = () => {
  const body = document.body;
  const doc = document.documentElement;

  return Math.ceil(
    Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      doc ? doc.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      mountNode ? mountNode.scrollHeight : 0
    )
  );
};

const postHeight = () => {
  const height = Math.max(320, readHeight());
  if (height === lastHeight) {
    return;
  }

  lastHeight = height;

  if (window.parent !== window) {
    const targetOrigin = window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "*";

    window.parent.postMessage({ type: "demo:resize", height }, targetOrigin);
  }
};

const queueHeight = () => {
  if (rafToken) {
    window.cancelAnimationFrame(rafToken);
  }

  rafToken = window.requestAnimationFrame(() => {
    rafToken = window.requestAnimationFrame(postHeight);
  });
};

root.render(React.createElement(App));

const resizeObserver = new ResizeObserver(queueHeight);
resizeObserver.observe(document.documentElement);
resizeObserver.observe(document.body);
resizeObserver.observe(mountNode);

const mutationObserver = new MutationObserver(queueHeight);
mutationObserver.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true
});

window.addEventListener("load", queueHeight);
window.addEventListener("resize", queueHeight);

queueHeight();
window.setTimeout(queueHeight, 64);
window.setTimeout(queueHeight, 256);
window.setTimeout(queueHeight, 1024);
`;
}

function demoHtml(demo) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${demo.title}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
      }

      body {
        background: transparent;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
}

async function buildDemo(demo) {
  const entryPath = path.join(demosRoot, demo.entry);
  if (!(await pathExists(entryPath))) {
    throw new Error(`Demo entry does not exist: ${entryPath}`);
  }

  const demoOutputRoot = path.join(outputRoot, demo.slug);
  await fs.rm(demoOutputRoot, { recursive: true, force: true });
  await fs.mkdir(demoOutputRoot, { recursive: true });

  await build({
    absWorkingDir: repoRoot,
    bundle: true,
    format: "esm",
    jsx: "automatic",
    loader: {
      ".js": "jsx",
      ".jsx": "jsx",
      ".ts": "ts",
      ".tsx": "tsx"
    },
    logLevel: "info",
    minify: isProduction,
    outfile: path.join(demoOutputRoot, "app.js"),
    platform: "browser",
    sourcemap: !isProduction,
    stdin: {
      contents: wrapperSource(demo.entry),
      loader: "jsx",
      resolveDir: repoRoot,
      sourcefile: `${demo.slug}.entry.jsx`
    },
    target: ["es2020"]
  });

  await fs.writeFile(path.join(demoOutputRoot, "index.html"), demoHtml(demo), "utf8");
}

async function main() {
  if (!(await pathExists(demosRoot))) {
    throw new Error(`Expected demo submodule at ${demosRoot}`);
  }

  const demos = await loadDemos();
  if (demos.length === 0) {
    throw new Error(`No demos found in ${demosRoot}`);
  }

  await fs.mkdir(outputRoot, { recursive: true });

  for (const demo of demos) {
    await buildDemo(demo);
    console.log(`Built demo: ${demo.slug}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

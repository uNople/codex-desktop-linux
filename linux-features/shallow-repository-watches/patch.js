"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PATCH_MARKER = "codexLinuxShallowRepositoryWatches";
const LOCAL_FILE_WATCH_METHOD =
  /async startFileWatch\((?<options>[A-Za-z_$][\w$]*)\)\{(?=let [^{}]{0,180}?await this\.platformPath\(\),[^{}]{0,180}?\(0,[A-Za-z_$][\w$]*\.watch\)\(this\.getFileSystemPath\(\k<options>\.path\),\{recursive:\k<options>\.recursive\})/gu;

function patchWorkerSource(source) {
  const markerCount = source.split(PATCH_MARKER).length - 1;
  LOCAL_FILE_WATCH_METHOD.lastIndex = 0;
  const matches = [...source.matchAll(LOCAL_FILE_WATCH_METHOD)];
  if (matches.length === 0) {
    if (markerCount > 0) {
      return { source, matched: markerCount, changed: 0, reason: null };
    }
    return {
      source,
      matched: 0,
      changed: 0,
      reason: "Local startFileWatch implementation not found",
    };
  }

  let patchedSource = source;
  let offset = 0;
  for (const match of matches) {
    const optionsName = match.groups.options;
    const branch =
      `if(process.platform===\`linux\`&&${optionsName}.recursive){` +
      `/*${PATCH_MARKER}*/` +
      `${optionsName}={...${optionsName},recursive:!1}}`;
    const methodStart = match.index + match[0].length + offset;
    patchedSource =
      patchedSource.slice(0, methodStart) + branch + patchedSource.slice(methodStart);
    offset += branch.length;
  }
  return {
    source: patchedSource,
    matched: markerCount + matches.length,
    changed: matches.length,
    reason: null,
  };
}

function findLocalFileWatchBundles(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    return { candidates: [], result: null, reason: ".vite/build directory not found" };
  }

  const bundlePaths = fs.readdirSync(buildDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(buildDir, entry.name))
    .sort();
  const candidates = [];

  for (const bundlePath of bundlePaths) {
    const source = fs.readFileSync(bundlePath, "utf8");
    const result = patchWorkerSource(source);
    if (result.matched > 0) candidates.push({ bundlePath, result });
  }

  if (candidates.length === 0) {
    return {
      candidates,
      result: null,
      reason:
        `Found 0 local startFileWatch implementations across ` +
        `${bundlePaths.length} build bundles`,
    };
  }

  const result = {
    matched: candidates.reduce((total, candidate) => total + candidate.result.matched, 0),
    changed: candidates.reduce((total, candidate) => total + candidate.result.changed, 0),
    reason: null,
  };
  return { candidates, result, reason: null };
}

function patchWorker(extractedDir) {
  const discovery = findLocalFileWatchBundles(extractedDir);
  if (!(discovery.result?.matched > 0)) {
    const reason = discovery.reason ?? "Local startFileWatch implementation not found";
    console.warn(`WARN: ${reason} - skipping shallow repository-watch feature`);
    return { matched: discovery.result?.matched ?? 0, changed: 0, reason };
  }
  for (const candidate of discovery.candidates) {
    if (candidate.result.changed > 0) {
      fs.writeFileSync(candidate.bundlePath, candidate.result.source, "utf8");
    }
  }
  return {
    matched: discovery.result.matched,
    changed: discovery.result.changed,
    reason: null,
    targets: discovery.candidates.map(({ bundlePath }) => path.relative(extractedDir, bundlePath)),
  };
}

const descriptors = [
  {
    id: "local-file-watch",
    phase: "extracted-app:pre-webview",
    order: 20_935,
    ciPolicy: "optional",
    apply: patchWorker,
    status: (result, warnings) => {
      if (!(result?.matched > 0)) {
        return { status: "skipped-optional", reason: result?.reason ?? warnings[0] ?? null };
      }
      return result.changed > 0 ? "applied" : "already-applied";
    },
  },
];

module.exports = {
  LOCAL_FILE_WATCH_METHOD,
  PATCH_MARKER,
  descriptors,
  findLocalFileWatchBundles,
  patchWorker,
  patchWorkerSource,
};

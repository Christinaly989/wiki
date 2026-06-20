import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectFiles(baseDir) {
  const output = {};
  const skippedExtensions = new Set([".sqlite", ".sqlite-wal", ".sqlite-shm"]);

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "logs") {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (skippedExtensions.has(path.extname(entry.name))) {
        continue;
      }

      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      output[relativePath] = fs.readFileSync(fullPath, "utf8");
    }
  }

  walk(path.join(rootDir, baseDir));
  return output;
}

function writeBundle(name, payload) {
  const json = JSON.stringify(payload, null, 2);
  const bundleDir = path.join(rootDir, "source-bundle");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, `${name}.json`), json, "utf8");
  fs.writeFileSync(path.join(bundleDir, `${name}.b64`), Buffer.from(json, "utf8").toString("base64"), "utf8");
}

writeBundle("client-source", collectFiles("client"));
writeBundle("server-source", collectFiles("server"));

console.log("Source bundles rebuilt.");

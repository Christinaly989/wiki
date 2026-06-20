import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(rootDir, "source-bundle");
const bundleFiles = [
  ["server-source.b64", "server-source.json"],
  ["client-source.b64", "client-source.json"],
];

for (const [primaryBundle, fallbackBundle] of bundleFiles) {
  const bundleName = [primaryBundle, fallbackBundle].find((name) => fs.existsSync(path.join(bundleDir, name)));
  if (!bundleName) {
    continue;
  }

  const bundlePath = path.join(bundleDir, bundleName);
  if (!fs.existsSync(bundlePath)) {
    continue;
  }

  const raw = fs.readFileSync(bundlePath, "utf8");
  const payload = bundleName.endsWith(".b64")
    ? JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
    : JSON.parse(raw);
  for (const [relativePath, content] of Object.entries(payload)) {
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
  }
}

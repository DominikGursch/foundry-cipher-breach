import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const RELEASE_FILES = Object.freeze([
  "module.json", "LICENSE", "NOTICE.md", "README.md",
  "scripts/engine.mjs", "scripts/mechanics.mjs", "scripts/ui.mjs", "scripts/foundry.mjs",
  "styles/cipher-breach.css", "lang/en.json", "lang/de.json"
]);

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP STORE keeps packaging dependency-free; only allowlisted release files are included.
export function buildArchive(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    if (!/^[A-Za-z0-9_./-]+$/.test(name) || name.includes("..") || name.startsWith("/")) {
      throw new Error("Unsafe ZIP entry.");
    }
    const filename = Buffer.from(name);
    const checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); // 1980-01-01, stable archive timestamps.
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(bytes.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}

export async function packageModule() {
  const manifestBytes = await readFile(path.join(ROOT, "module.json"));
  const manifest = JSON.parse(manifestBytes);
  const packageInfo = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const base = "https://github.com/DominikGursch/foundry-cipher-breach/releases";
  if (manifest.id !== "foundry-cipher-breach" || !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
      manifest.version !== packageInfo.version ||
      manifest.manifest !== `${base}/latest/download/module.json` ||
      manifest.download !== `${base}/download/v${manifest.version}/foundry-cipher-breach-v${manifest.version}.zip`) {
    throw new Error("Check release ID, version, package version and URLs before packaging.");
  }
  const entries = await Promise.all(RELEASE_FILES.map(async name => ({
    name, bytes: await readFile(path.join(ROOT, ...name.split("/")))
  })));
  const output = path.join(ROOT, "dist");
  await mkdir(output, { recursive: true });
  const archiveName = `foundry-cipher-breach-v${manifest.version}.zip`;
  await writeFile(path.join(output, archiveName), buildArchive(entries));
  await writeFile(path.join(output, "module.json"), manifestBytes);
  console.log(`Created dist/${archiveName} and dist/module.json (${entries.length} files).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await packageModule();
}

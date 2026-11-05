import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArchive, crc32, RELEASE_FILES } from "../tools/package.mjs";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8");

test("ZIP entries are at root, have valid offsets, CRC and deterministic bytes", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const entries = [
    { name: "module.json", bytes: Buffer.from('{"id":"test"}') },
    { name: "scripts/engine.mjs", bytes: Buffer.from("export const x = 1;") }
  ];
  const archive = buildArchive(entries);
  assert.deepEqual(archive, buildArchive(entries));
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), 2);
  let directory = archive.readUInt32LE(end + 16);
  for (const entry of entries) {
    assert.equal(archive.readUInt32LE(directory), 0x02014b50);
    const offset = archive.readUInt32LE(directory + 42);
    assert.equal(archive.readUInt32LE(offset), 0x04034b50);
    const nameLength = archive.readUInt16LE(offset + 26);
    assert.equal(archive.subarray(offset + 30, offset + 30 + nameLength).toString(), entry.name);
    const data = archive.subarray(offset + 30 + nameLength, offset + 30 + nameLength + entry.bytes.length);
    assert.deepEqual(data, entry.bytes);
    assert.equal(archive.readUInt32LE(directory + 16), crc32(data));
    directory += 46 + archive.readUInt16LE(directory + 28);
  }
  assert.equal(directory, end);
  assert.throws(() => buildArchive([{ name: "../bad", bytes: Buffer.alloc(0) }]));
});

test("manifest entry points exist, release URLs match, all runtime files are packaged", async () => {
  const manifest = JSON.parse(await read("module.json"));
  assert.equal(manifest.id, "foundry-cipher-breach");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.compatibility.minimum, "12");
  assert.equal(manifest.compatibility.verified, undefined);
  const base = `https://github.com/DominikGursch/foundry-cipher-breach/releases/download/v${manifest.version}`;
  assert.equal(manifest.manifest, `${base}/module.json`);
  assert.equal(manifest.download, `${base}/foundry-cipher-breach-v${manifest.version}.zip`);
  const paths = [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(lang => lang.path)];
  for (const name of paths) {
    assert.ok(RELEASE_FILES.includes(name));
    assert.ok((await read(name)).length > 0);
  }
  for (const name of RELEASE_FILES) assert.ok((await read(name)).length > 0);
});

test("EN/DE have identical keys and every statically referenced translation exists", async () => {
  const en = JSON.parse(await read("lang/en.json")).CB;
  const de = JSON.parse(await read("lang/de.json")).CB;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const filename of ["scripts/ui.mjs", "scripts/foundry.mjs", "preview/preview.mjs"]) {
    const source = await read(filename);
    for (const match of source.matchAll(/\bt\("([^"]+)"\)/g)) assert.equal(typeof en[match[1]], "string", match[1]);
  }
  for (const status of ["ready", "running", "won", "timeout", "full-buffer", "jacked-out", "dead-end"]) {
    assert.equal(typeof en[status], "string");
  }
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), `Empty EN translation: ${key}`);
    assert.ok(de[key].trim(), `Empty DE translation: ${key}`);
  }
});

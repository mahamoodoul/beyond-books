#!/usr/bin/env node
/**
 * Write an uncompressed copy of a GLB that uses EXT_meshopt_compression.
 *
 *   node scripts/decompress-glb.mjs frontend/public/models/heart.glb /tmp/heart-plain.glb
 *
 * The 3D library only accepts plain glTF buffers (see backend/app/modules/three_d/glb.py), while
 * the AR/3D heart ships meshopt-compressed for fast loading. This decodes every compressed
 * bufferView with three.js' bundled meshopt decoder (no extra dependencies; needs
 * `frontend/node_modules`), packs the result into a single BIN chunk and drops the extension.
 * Geometry, node names and materials are untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const { MeshoptDecoder } = await import(
  new URL('../frontend/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js', import.meta.url)
);

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/decompress-glb.mjs <in.glb> <out.glb>');
  process.exit(2);
}

const glb = readFileSync(input);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${input} is not a GLB file`);
let json = null;
let bin = Buffer.alloc(0);
for (let offset = 12; offset < glb.length; ) {
  const length = glb.readUInt32LE(offset);
  const type = glb.readUInt32LE(offset + 4);
  const chunk = glb.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004e4942) bin = chunk;
  offset += 8 + length;
}
if (!json) throw new Error('GLB has no JSON chunk');

const EXT = 'EXT_meshopt_compression';
// Only the GLB's own BIN chunk (a buffer without a uri) can hold data; fallback buffers are empty.
const binBufferIndex = json.buffers.findIndex((b) => b.uri === undefined && !b.extensions?.[EXT]?.fallback);
const sourceOf = (bufferIndex) => {
  if (bufferIndex !== binBufferIndex) throw new Error(`buffer ${bufferIndex} is external or a fallback; not supported`);
  return bin;
};

await MeshoptDecoder.ready;
const parts = [];
let size = 0;
for (const view of json.bufferViews ?? []) {
  const ext = view.extensions?.[EXT];
  let data;
  if (ext) {
    const source = sourceOf(ext.buffer).subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
    data = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(data, ext.count, ext.byteStride, source, ext.mode, ext.filter ?? 'NONE');
    delete view.extensions[EXT];
    if (Object.keys(view.extensions).length === 0) delete view.extensions;
  } else {
    data = sourceOf(view.buffer).subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  }
  const pad = (4 - (size % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad));
  size += pad;
  view.buffer = 0;
  view.byteOffset = size;
  view.byteLength = data.byteLength;
  parts.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  size += data.byteLength;
}

json.buffers = [{ byteLength: size }];
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (!json[key]) continue;
  json[key] = json[key].filter((name) => name !== EXT);
  if (json[key].length === 0) delete json[key];
}

const pad4 = (buf, fill) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), fill)]) : buf);
const jsonChunk = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
const binChunk = pad4(Buffer.concat(parts), 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const chunkHeader = (length, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(length, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
writeFileSync(output, Buffer.concat([
  header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk,
]));
console.log(`wrote ${output} (${(size / 1024 / 1024).toFixed(1)} MB uncompressed, ${json.bufferViews.length} buffer views)`);

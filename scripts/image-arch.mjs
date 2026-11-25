#!/usr/bin/env node
// Checks that a saved container image tar (docker save or skopeo docker-archive) holds images for
// one expected CPU architecture. Usage: node scripts/image-arch.mjs <image.tar> <amd64|arm64>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Reads every regular file of a ustar archive into a name -> contents map. */
export function readTar(buf) {
  const files = new Map();
  let off = 0;
  let longName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => header.subarray(start, start + len).toString('utf8').replace(/\0.*$/s, '');
    const prefix = field(345, 155);
    let name = field(0, 100);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
    else if (type === '0' || type === '\0') {
      files.set((longName ?? name).replace(/^\.\//, ''), body);
      longName = null;
    } else longName = null;
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** Returns the architecture of every image in the archive, in manifest order. */
export function imageArchitectures(buf) {
  const files = readTar(buf);
  const manifest = files.get('manifest.json');
  if (!manifest) throw new Error('manifest.json is missing: this is not a saved image archive');
  return JSON.parse(manifest.toString('utf8')).map((entry) => {
    const config = files.get(entry.Config);
    if (!config) throw new Error(`image config ${entry.Config} is missing`);
    const parsed = JSON.parse(config.toString('utf8'));
    return { tags: entry.RepoTags ?? [], architecture: parsed.architecture, os: parsed.os };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, expected] = process.argv.slice(2);
  if (!file || !expected) {
    console.error('Usage: node scripts/image-arch.mjs <image.tar> <amd64|arm64>');
    process.exit(2);
  }
  const images = imageArchitectures(readFileSync(file));
  for (const image of images) console.log(`${image.tags.join(', ') || '(untagged)'}: ${image.os}/${image.architecture}`);
  const wrong = images.filter((image) => image.architecture !== expected);
  if (images.length === 0 || wrong.length > 0) {
    console.error(`Expected only ${expected} images in ${file}.`);
    process.exit(1);
  }
}

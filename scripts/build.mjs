import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
const workspace = path.resolve('.');
const output = path.resolve(workspace, 'dist');
// Only replace this project's generated output, including files removed from source.
if (path.dirname(output) !== workspace || path.basename(output) !== 'dist') throw Error('Invalid build directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile('index.html', path.join(output, 'index.html'));
await copyFile('favicon.svg', path.join(output, 'favicon.svg'));
await cp('src', path.join(output, 'src'), { recursive: true });
await cp('art', path.join(output, 'art'), { recursive: true });
console.log('Built Metallic to dist/');

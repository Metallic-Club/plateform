import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { games } from '../src/catalog.js';
test('standalone reference SVGs use XML casing and resolve paint references', async () => {
  const files = [...games.map(g=>g.art), ...[0,1,2,3].map(i=>`art/avatar-${i}.svg`)];
  for (const file of files) {
    const source = await readFile(new URL('../public/'+file, import.meta.url), 'utf8');
    assert.match(source,/xmlns="http:\/\/www.w3.org\/2000\/svg"/,file);
    assert.match(source,/viewBox=/,file);
    assert.doesNotMatch(source,/<\/?(?:lineargradient|radialgradient|clippath)\b/,file);
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    for (const match of source.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(match[1]),`${file}: unresolved ${match[1]}`);
  }
});

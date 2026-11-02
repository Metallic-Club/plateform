import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { games } from '../src/catalog.js';

test('every game poster is a JPEG at the path the catalogue uses', async () => {
  for (const game of games) {
    assert.match(game.art, /^art\/game-\d+\.jpg$/, `${game.id} should point at a JPEG`);
    const body = await readFile(new URL('../' + game.art, import.meta.url));
    assert.ok(body.length > 12000, `${game.art} is only ${body.length} bytes`);
    assert.equal(body[0], 0xff, `${game.art} does not start with a JPEG marker`);
    assert.equal(body[1], 0xd8, `${game.art} does not start with a JPEG marker`);
  }
});

test('avatar SVGs use XML casing and resolve paint references', async () => {
  for (const file of [0, 1, 2, 3].map(i => `art/avatar-${i}.svg`)) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(source, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, file);
    assert.match(source, /viewBox=/, file);
    assert.doesNotMatch(source, /<\/?(?:lineargradient|radialgradient|clippath)\b/, file);
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    for (const match of source.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(match[1]), `${file}: unresolved ${match[1]}`);
  }
});

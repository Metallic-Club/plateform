"""Fetches licensed photography for the 14 catalogue posters.

Candidates come from Wikimedia Commons, restricted to CC0, public domain and
CC BY, and are cached in /tmp/cand. The chosen frame is cropped to 16:9, graded
and written to art/game-N.jpg; sources are recorded in docs/art-credits.md.
Re-run with tools/art-picks.json ({"1": 2}) to choose a different candidate.
"""
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'MetallicSiteBuilder/1.0 (static preview; contact: repo owner)'
CAND = pathlib.Path('/tmp/cand')
OUT = pathlib.Path('art')
CAND.mkdir(parents=True, exist_ok=True)

# theme queries and a per-game grade: (saturation, contrast, shadow tint, highlight tint)
TOPICS = {
    1: ('Cyber Raven: Neon Protocol', ['neon signs Hong Kong street night', 'neon signs night street Tokyo'], (1.18, 1.16, (8, 16, 44), (40, 24, 60))),
    2: ('Metallic Obby Sprint', ['indoor climbing wall', 'obstacle course sport'], (1.12, 1.14, (6, 30, 28), (30, 40, 24))),
    3: ('Rift Hunters', ['antelope canyon sandstone', 'slot canyon sandstone'], (1.2, 1.18, (24, 8, 40), (56, 20, 44))),
    4: ('Obsidian Arena PvP', ['colosseum interior Rome', 'roman amphitheatre arena'], (1.14, 1.2, (30, 10, 8), (60, 30, 12))),
    5: ('Void Crafters 3D', ['Tarantula Nebula Hubble', 'star forming region nebula'], (1.24, 1.12, (6, 18, 40), (34, 44, 66))),
    6: ('Raven Blox RP City', ['pedestrian shopping street city', 'city street shops pedestrians'], (1.06, 1.06, (12, 20, 30), (34, 30, 20))),
    7: ('Deepwater Survival', ['scuba diver underwater', 'coral reef diver'], (1.16, 1.12, (4, 26, 40), (24, 52, 56))),
    8: ('Pixel Farmstead', ['barn in field', 'farmhouse field countryside'], (1.1, 1.1, (26, 16, 8), (56, 40, 16))),
    9: ('Neon Drift Circuit', ['kart racing', 'rally car gravel road', 'racing circuit aerial'], (1.2, 1.16, (14, 6, 30), (52, 18, 40))),
    10: ('City of Ashfall', ['abandoned factory ruins', 'ruined building interior'], (1.02, 1.14, (24, 16, 10), (46, 30, 14))),
    11: ('Hollow Night Tactics', ['full moon clouds night', 'moonlit landscape'], (1.04, 1.14, (8, 14, 32), (30, 36, 52))),
    12: ('Starship Flight Sim', ['Earth from International Space Station', 'spacecraft orbiting Earth'], (1.08, 1.12, (4, 10, 26), (24, 34, 56))),
    13: ('Skyforge Tycoon', ['sunset clouds mountains', 'clouds golden hour aerial'], (1.08, 1.06, (20, 14, 26), (58, 38, 24))),
    14: ('Iron Vanguard', ['plate armour knight', 'medieval armour helmet'], (1.0, 1.2, (14, 18, 24), (36, 38, 40))),
}

LICENSE_OK = ('cc0', 'public domain', 'cc by', 'pdm')


def api(params):
    url = API + '?' + urllib.parse.urlencode(params)
    delay = 4
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 3:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError('retries exhausted')


def search(query, limit=8):
    data = api({'action': 'query', 'format': 'json', 'generator': 'search',
                'gsrsearch': 'filetype:bitmap ' + query, 'gsrnamespace': 6, 'gsrlimit': limit,
                'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 1100})
    pages = (data.get('query') or {}).get('pages') or {}
    out = []
    for page in pages.values():
        info = (page.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata') or {}
        lic = (meta.get('LicenseShortName') or {}).get('value', '')
        artist = re.sub(r'<[^>]+>', '', (meta.get('Artist') or {}).get('value', '')).strip()
        if not info.get('thumburl') or not info.get('width'):
            continue
        if not any(token in lic.lower() for token in LICENSE_OK):
            continue
        if info['width'] < 1100 or info['height'] < 600:
            continue
        ratio = info['width'] / max(info['height'], 1)
        if not 1.15 <= ratio <= 2.6:
            continue
        out.append({'title': page.get('title', '').replace('File:', ''), 'artist': artist, 'license': lic,
                    'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(page.get('title', '')),
                    'thumb': info['thumburl'], 'width': info['width'], 'height': info['height']})
    return out


def download(url, path):
    if path.exists() and path.stat().st_size > 8000:
        return True
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        body = urllib.request.urlopen(req, timeout=60).read()
        if len(body) < 8000:
            return False
        path.write_bytes(body)
        return True
    except Exception:
        return False


def grade(image, sat, con, shadow_tint, highlight_tint):
    width, height = image.size
    target = 16 / 9
    if width / height > target:
        new_w = int(height * target)
        left = (width - new_w) // 2
        image = image.crop((left, 0, left + new_w, height))
    else:
        new_h = int(width / target)
        top = int((height - new_h) * 0.42)
        image = image.crop((0, top, width, top + new_h))
    image = image.convert('RGB').resize((960, 540), Image.LANCZOS)
    image = ImageEnhance.Color(image).enhance(sat)
    image = ImageEnhance.Contrast(image).enhance(con)
    # tint shadows and highlights with a soft two-colour grade
    tinted = Image.new('RGB', image.size, shadow_tint)
    image = Image.blend(image, ImageChops.add(image, tinted, scale=2.2), 0.35)
    glow = image.filter(ImageFilter.GaussianBlur(9))
    image = Image.blend(image, ImageChops.screen(image, glow), 0.28)
    # highlight colour grade
    wash = Image.new('RGB', image.size, highlight_tint)
    image = Image.blend(image, ImageChops.screen(image, wash), 0.16)
    # vignette
    mask = Image.new('L', image.size, 0)
    grad = Image.radial_gradient('L').resize(image.size)
    mask = ImageChops.invert(grad).point(lambda v: int(v * 0.85))
    dark = Image.new('RGB', image.size, (4, 5, 8))
    image = Image.composite(image, dark, mask)
    # grain
    noise = Image.effect_noise(image.size, 14).convert('RGB')
    image = Image.blend(image, noise, 0.045)
    return image.resize((640, 360), Image.LANCZOS)


def main():
    picks_file = pathlib.Path('tools/art-picks.json')
    picks = json.loads(picks_file.read_text()) if picks_file.exists() else {}
    manifest = []
    sheets = []
    for number, (name, queries, grade_args) in TOPICS.items():
        folder = CAND / str(number)
        folder.mkdir(exist_ok=True)
        found = []
        for query in queries:
            cache = folder / ('%s.json' % re.sub(r'\W+', '-', query.lower()))
            if cache.exists():
                found.extend(json.loads(cache.read_text()))
            else:
                try:
                    hits = search(query)
                    found.extend(hits)
                    cache.write_text(json.dumps(hits))
                except Exception as exc:
                    print('search failed for %s: %s' % (query, exc))
                time.sleep(3)
            if len(found) >= 5:
                break
        kept = []
        for index, item in enumerate(found[:6]):
            path = folder / ('%d.jpg' % index)
            if download(item['thumb'], path):
                item['file'] = str(path)
                kept.append(item)
        if not kept:
            print('%2d %-28s NO CANDIDATES' % (number, name))
            continue
        choice = int(picks.get(str(number), 0))
        choice = choice if 0 <= choice < len(kept) else 0
        item = kept[choice]
        image = grade(Image.open(item['file']), *grade_args)
        target = OUT / ('game-%d.jpg' % number)
        image.save(target, 'JPEG', quality=84, optimize=True, progressive=True)
        manifest.append(dict(number=number, game=name, choice=choice, candidates=len(kept),
                             title=item['title'], artist=item['artist'] or 'unknown',
                             license=item['license'], page=item['page'], file=str(target)))
        sheet = Image.new('RGB', (3 * 300, 2 * 190), (18, 18, 20))
        for i, cand in enumerate(kept):
            thumb = Image.open(cand['file']).convert('RGB')
            thumb.thumbnail((296, 170), Image.LANCZOS)
            sheet.paste(thumb, ((i % 3) * 300 + 2, (i // 3) * 190 + 2))
        sheet.save('artifacts/candidates-%d.png' % number)
        sheets.append(number)
        print('%2d %-28s use #%d of %d  %s [%s]  %5d bytes'
              % (number, name, choice, len(kept), item['title'][:38], item['license'], target.stat().st_size))
    pathlib.Path('/tmp/art-manifest.json').write_text(json.dumps(manifest, indent=2))
    credits = ['# Poster image credits', '',
               'The 14 catalogue posters are graded crops of photographs from Wikimedia Commons,',
               'used under the licence named in each row. Each entry links to the file page, which',
               'carries the full licence text and the author\'s preferred attribution.', '',
               '| Game | File | Source | Author | Licence |', '|---|---|---|---|---|']
    for row in manifest:
        credits.append('| %s | `%s` | [%s](%s) | %s | %s |' % (
            row['game'], row['file'], row['title'].replace('|', '/'), row['page'],
            row['artist'].replace('|', '/'), row['license']))
    credits += ['', 'Re-run `python3 tools/fetch-art.py` to rebuild the crops; the picks live in',
                '`tools/art-picks.json`.']
    pathlib.Path('docs/art-credits.md').write_text('\n'.join(credits) + '\n')
    print('written', len(manifest), 'posters and docs/art-credits.md')


if __name__ == '__main__':
    main()

"""Generates the 14 catalogue posters in art/.

Each poster is an original vector scene for one sample game: layered silhouettes,
one light source, a readable focal subject. Run `python3 tools/make-posters.py`
after editing a scene; the script writes only the game-*.svg files.
"""
import pathlib
import random
import re

OUT = pathlib.Path('art')
OUT.mkdir(exist_ok=True)


def stops(items):
    out = []
    for item in items:
        off, col = item[0], item[1]
        alpha = item[2] if len(item) > 2 else None
        piece = '<stop offset="%s" stop-color="%s"' % (off, col)
        if alpha is not None:
            piece += ' stop-opacity="%s"' % alpha
        out.append(piece + '/>')
    return ''.join(out)


def lin(gid, items, x1=0, y1=0, x2=0, y2=1):
    return '<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (
        gid, x1, y1, x2, y2, stops(items))


def rad(gid, items, cx='50%', cy='50%', r='50%'):
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s">%s</radialGradient>' % (
        gid, cx, cy, r, stops(items))


def vig(gid, strength=0.55):
    return rad(gid, [(0, '#000', 0), (0.6, '#000', 0), (1, '#000', strength)])


def doc(pid, defs, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="poster-art" '
            'preserveAspectRatio="xMidYMid slice" viewBox="0 0 480 270">'
            '<defs>' + ''.join(defs) + '</defs>'
            '<rect width="480" height="270" fill="url(#%ssky)"/>' % pid
            + ''.join(body) + '<rect width="480" height="270" fill="url(#%svig)"/></svg>' % pid)


def humanoid(fill, arms='d', legs='stand'):
    arm = {'d': 'M-7 -16 -15 -4 M7 -16 15 -4',
           'raise': 'M-7 -16 -16 -26 M7 -16 16 -24',
           'reach': 'M-7 -16 -18 -10 M7 -16 18 -14',
           'sword': 'M-7 -16 -17 -6 M7 -16 20 -28'}[arms]
    leg = {'stand': 'M-4 -3 -6 16 M4 -3 6 16',
           'run': 'M-4 -3 -14 12 M4 -3 12 10',
           'jump': 'M-4 -3 -12 8 M4 -3 10 6',
           'wide': 'M-4 -3 -12 16 M4 -3 12 16'}[legs]
    return ('<g><circle cx="0" cy="-27" r="6.5" fill="%s"/><path d="M-7 -20 h14 v17 h-14z" fill="%s"/>'
            '<path d="%s" stroke="%s" stroke-width="4.5" stroke-linecap="round" fill="none"/>'
            '<path d="%s" stroke="%s" stroke-width="5.5" stroke-linecap="round" fill="none"/></g>'
            % (fill, fill, arm, fill, leg, fill))


def stars(rnd, count, top=0, bottom=200):
    out = []
    for _ in range(count):
        out.append('<circle cx="%.1f" cy="%.1f" r="%s" fill="#f4f7ff" opacity="%s"/>'
                   % (rnd.uniform(4, 476), rnd.uniform(top, bottom),
                      rnd.choice([0.6, 0.8, 1.1, 1.4]), rnd.choice([0.35, 0.55, 0.8])))
    return out


def cyber_raven():
    P = 'a1'
    rnd = random.Random(1)
    defs = [lin(P + 'sky', [(0, '#07061a'), (0.5, '#1c0d3f'), (1, '#451335')]),
            rad(P + 'pink', [(0, '#ff3d9a', 0.6), (1, '#ff3d9a', 0)]),
            rad(P + 'cyan', [(0, '#39e1ff', 0.45), (1, '#39e1ff', 0)]),
            lin(P + 'wet', [(0, '#2a1040', 0.95), (1, '#07030f', 0.98)]),
            vig(P + 'vig', 0.6)]
    b = ['<circle cx="356" cy="152" r="165" fill="url(#%spink)"/>' % P,
         '<circle cx="120" cy="120" r="110" fill="url(#%scyan)"/>' % P]
    x = -10
    while x < 490:
        w, h = rnd.randint(24, 54), rnd.randint(46, 118)
        b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#130d29"/>' % (x, 196 - h, w, h + 84))
        for wy in range(196 - h + 9, 190, 15):
            for wx in range(x + 6, x + w - 6, 13):
                if rnd.random() < 0.45:
                    b.append('<rect x="%d" y="%d" width="4" height="6" fill="%s" opacity="%s"/>'
                             % (wx, wy, rnd.choice(['#8ee7ff', '#ffa8d8', '#ffd98e']),
                                rnd.choice([0.25, 0.5, 0.75])))
        x += w + rnd.randint(3, 11)
    b.append('<rect y="196" width="480" height="74" fill="url(#%swet)"/>' % P)
    for i in range(9):
        b.append('<rect x="%d" y="%d" width="2" height="%d" fill="#ff8ad0" opacity="0.28"/>'
                 % (20 + i * 52, 206, rnd.randint(18, 44)))
    b.append('<rect x="52" y="118" width="12" height="60" rx="6" fill="#ff2f92" opacity="0.9"/>')
    b.append('<rect x="54" y="122" width="8" height="52" rx="4" fill="#ffd6ea" opacity="0.55"/>')
    b.append('<rect x="424" y="104" width="10" height="52" rx="5" fill="#2fd8ff" opacity="0.9"/>')
    b.append('<rect x="426" y="108" width="6" height="44" rx="3" fill="#d8f8ff" opacity="0.5"/>')
    b.append('<path d="M0 214 Q120 206 240 212 T480 208" stroke="#ff4fa8" stroke-width="2" fill="none" opacity="0.5"/>')
    b.append('<rect x="286" y="170" width="150" height="9" rx="3" fill="#0a0616"/>')
    b.append('<path d="M300 179 l6 14 h120 l6 -14z" fill="#0a0616"/>')
    b.append('<ellipse cx="332" cy="150" rx="23" ry="15" fill="#05030c"/>')
    b.append('<circle cx="353" cy="138" r="9.5" fill="#05030c"/>')
    b.append('<path d="M361 134 L378 139 L361 142 Z" fill="#05030c"/>')
    b.append('<path d="M311 146 L286 164 L314 158 Z" fill="#05030c"/>')
    b.append('<path d="M352 132 a10 10 0 0 1 9 7" stroke="#8be9ff" stroke-width="2" fill="none" opacity="0.85"/>')
    b.append('<path d="M310 141 q10 -12 24 -9" stroke="#ff77bd" stroke-width="2.5" fill="none" opacity="0.8"/>')
    b.append('<path d="M324 164 v6 M340 164 v6" stroke="#a9d7ff" stroke-width="2"/>')
    b.append('<circle cx="356" cy="136" r="2" fill="#ff2f6e"/>')
    for _ in range(16):
        x1, y1 = rnd.uniform(0, 480), rnd.uniform(0, 180)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#cfe7ff" stroke-width="1" opacity="0.1"/>'
                 % (x1, y1, x1 + 5, y1 + 22))
    b.append('<path d="M0 270 L0 232 Q60 224 120 236 L120 270 Z" fill="#05030d" opacity="0.95"/>')
    b.append('<path d="M480 270 L480 226 Q430 220 392 234 L392 270 Z" fill="#05030d" opacity="0.95"/>')
    return doc(P, defs, b)


def obby_sprint():
    P = 'a2'
    rnd = random.Random(2)
    defs = [lin(P + 'sky', [(0, '#061b2e'), (0.55, '#0e3b52'), (1, '#1a6b6a')]),
            rad(P + 'sun', [(0, '#9dfbd1', 0.5), (1, '#9dfbd1', 0)]),
            vig(P + 'vig', 0.5)]
    b = ['<circle cx="96" cy="66" r="96" fill="url(#%ssun)"/>' % P,
         '<circle cx="96" cy="66" r="26" fill="#d9fff0" opacity="0.85"/>']
    for i in range(5):
        b.append('<ellipse cx="%d" cy="%d" rx="%d" ry="9" fill="#bff5ff" opacity="0.12"/>'
                 % (40 + i * 110, 46 + (i % 3) * 26, 46 + i * 6))
    for (px, py, pw, ph) in [(30, 214, 96, 22), (150, 190, 88, 20), (268, 168, 82, 18), (372, 144, 78, 18)]:
        b.append('<polygon points="%d,%d %d,%d %d,%d %d,%d" fill="%s"/>'
                 % (px, py, px + pw, py, px + pw - 10, py - 12, px + 10, py - 12,
                    '#57e0b0' if (px // 10) % 2 else '#7ef0c4'))
        b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#1b6f74"/>' % (px, py, pw, ph))
        b.append('<rect x="%d" y="%d" width="%d" height="4" fill="#0d3f47" opacity="0.7"/>' % (px, py + ph - 4, pw))
        for sw in range(0, pw - 8, 16):
            b.append('<rect x="%d" y="%d" width="8" height="8" fill="#0f4a4d" opacity="0.55"/>' % (px + sw + 4, py + 6))
    b.append('<g transform="translate(212 158) scale(1.5)">%s</g>' % humanoid('#08222c', 'raise', 'jump'))
    for i in range(4):
        b.append('<rect x="%d" y="%d" width="26" height="3" rx="1.5" fill="#8ef7d6" opacity="%s"/>'
                 % (166 - i * 20, 148 + i * 12, 0.5 - i * 0.09))
    b.append('<rect x="404" y="86" width="4" height="60" fill="#e8f6ff"/>')
    b.append('<path d="M408 86 h30 v22 h-30z" fill="#ffd166"/>')
    b.append('<path d="M408 108 h30 v22 h-30z" fill="#2b2f3a"/>')
    for gx in range(3):
        for gy in range(2):
            b.append('<rect x="%d" y="%d" width="10" height="11" fill="%s"/>'
                     % (408 + gx * 10, 86 + gy * 22, '#1b1e27' if (gx + gy) % 2 else '#ffd166'))
    for _ in range(26):
        b.append('<circle cx="%d" cy="%d" r="2" fill="%s" opacity="0.6"/>'
                 % (rnd.randint(10, 470), rnd.randint(40, 220), rnd.choice(['#9dfbd1', '#ffd166', '#ffffff'])))
    b.append('<path d="M0 270 L0 246 Q90 236 180 250 L180 270 Z" fill="#061a22"/>')
    b.append('<path d="M480 270 L480 242 Q400 234 340 252 L340 270 Z" fill="#061a22"/>')
    return doc(P, defs, b)


def rift_hunters():
    P = 'a3'
    rnd = random.Random(3)
    defs = [lin(P + 'sky', [(0, '#120a24'), (0.5, '#2b1350'), (1, '#4a1c3d')]),
            rad(P + 'rift', [(0, '#f4f0ff', 0.95), (0.35, '#9d7bff', 0.8), (1, '#4d2a9c', 0)]),
            rad(P + 'halo', [(0, '#c9b6ff', 0.4), (1, '#c9b6ff', 0)]),
            vig(P + 'vig', 0.6)]
    b = ['<circle cx="240" cy="132" r="150" fill="url(#%shalo)"/>' % P,
         '<polygon points="0,0 150,0 118,270 0,270" fill="#150d28"/>',
         '<polygon points="480,0 330,0 366,270 480,270" fill="#150d28"/>',
         '<polygon points="0,0 118,0 96,270 0,270" fill="#0d0819"/>',
         '<polygon points="480,0 366,0 392,270 480,270" fill="#0d0819"/>']
    b.append('<ellipse cx="240" cy="132" rx="52" ry="96" fill="url(#%srift)"/>' % P)
    b.append('<ellipse cx="240" cy="132" rx="30" ry="74" fill="#efe9ff" opacity="0.75"/>')
    b.append('<ellipse cx="240" cy="132" rx="16" ry="52" fill="#ffffff" opacity="0.9"/>')
    for i in range(5):
        b.append('<ellipse cx="240" cy="132" rx="%d" ry="%d" fill="none" stroke="#d9cbff" stroke-width="1.4" opacity="%s" transform="rotate(%d 240 132)"/>'
                 % (58 + i * 9, 102 + i * 9, 0.5 - i * 0.07, i * 18))
    b.append('<path d="M0 206 Q120 192 240 202 T480 196 L480 270 L0 270 Z" fill="#120c22"/>')
    b.append('<path d="M0 214 Q120 200 240 210 T480 204" stroke="#a98cff" stroke-width="2" fill="none" opacity="0.5"/>')
    b.append('<g transform="translate(164 208) scale(1.35)">%s</g>' % humanoid('#08050f', 'sword', 'wide'))
    b.append('<line x1="188" y1="180" x2="228" y2="130" stroke="#cbb6ff" stroke-width="3"/>')
    b.append('<g transform="translate(318 208) scale(1.25)">%s</g>' % humanoid('#08050f', 'sword', 'wide'))
    b.append('<line x1="296" y1="182" x2="256" y2="136" stroke="#cbb6ff" stroke-width="3"/>')
    for _ in range(30):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="%s" opacity="%s"/>'
                 % (rnd.randint(150, 340), rnd.randint(20, 240), rnd.choice([1, 1.6, 2.2]),
                    rnd.choice(['#e6d9ff', '#ffb8f0', '#9d7bff']), rnd.choice([0.4, 0.7, 0.9])))
    b.append('<path d="M0 270 L0 236 Q70 228 132 244 L132 270 Z" fill="#0a0715"/>')
    b.append('<path d="M480 270 L480 232 Q420 226 372 246 L372 270 Z" fill="#0a0715"/>')
    return doc(P, defs, b)


def obsidian_arena():
    P = 'a4'
    rnd = random.Random(4)
    defs = [lin(P + 'sky', [(0, '#160b0b'), (0.45, '#2c1210'), (1, '#4d1c12')]),
            rad(P + 'lava', [(0, '#ffb347', 0.85), (1, '#ff5a1f', 0)]),
            lin(P + 'floor', [(0, '#241010'), (1, '#0c0505')]),
            vig(P + 'vig', 0.6)]
    b = ['<circle cx="240" cy="196" r="170" fill="url(#%slava)"/>' % P]
    for i in range(4):
        b.append('<path d="M%d 0 Q%d 90 %d 150" stroke="#3a1a16" stroke-width="%d" fill="none" opacity="0.9"/>'
                 % (40 + i * 120, 60 + i * 90, 90 + i * 110, 16 - i * 2))
    b.append('<path d="M0 60 Q240 6 480 60 L480 96 Q240 52 0 96 Z" fill="#1b0c0c"/>')
    b.append('<path d="M0 104 Q240 56 480 104 L480 128 Q240 84 0 128 Z" fill="#150909" opacity="0.9"/>')
    for i in range(7):
        b.append('<circle cx="%d" cy="78" r="7" fill="#ffb85c" opacity="0.85"/>' % (18 + i * 66))
        b.append('<circle cx="%d" cy="78" r="16" fill="url(#%slava)" opacity="0.7"/>' % (18 + i * 66, P))
    b.append('<path d="M0 152 L480 152 L480 270 L0 270 Z" fill="url(#%sfloor)"/>' % P)
    b.append('<path d="M0 152 L480 152" stroke="#6d2c1c" stroke-width="3"/>')
    for i in range(5):
        b.append('<path d="M%d 168 q40 14 84 6 q50 -9 96 4" stroke="#ff7a2f" stroke-width="%s" fill="none" opacity="%s"/>'
                 % (20 + i * 88, 2.4 - i * 0.2, 0.75 - i * 0.1))
    b.append('<ellipse cx="220" cy="238" rx="90" ry="20" fill="#ff8a3a" opacity="0.14"/>')
    b.append('<g transform="translate(186 232) scale(1.55)">%s</g>' % humanoid('#0a0404', 'sword', 'wide'))
    b.append('<line x1="212" y1="196" x2="268" y2="150" stroke="#ffd9a8" stroke-width="3.5"/>')
    b.append('<g transform="translate(300 232) scale(1.5)">%s</g>' % humanoid('#0a0404', 'sword', 'wide'))
    b.append('<line x1="272" y1="198" x2="220" y2="154" stroke="#ffd9a8" stroke-width="3.5"/>')
    b.append('<circle cx="244" cy="176" r="10" fill="#fff2c8" opacity="0.9"/>')
    for _ in range(18):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="#ffcf7a" opacity="%s"/>'
                 % (rnd.randint(210, 290), rnd.randint(110, 210), rnd.choice([1, 1.5, 2]), rnd.choice([0.5, 0.8])))
    b.append('<path d="M0 270 L0 244 Q60 236 110 248 L110 270 Z" fill="#080303"/>')
    b.append('<path d="M480 270 L480 240 Q420 234 380 250 L380 270 Z" fill="#080303"/>')
    return doc(P, defs, b)


def void_crafters():
    P = 'a5'
    rnd = random.Random(5)
    defs = [lin(P + 'sky', [(0, '#050818'), (0.5, '#0b1b3c'), (1, '#123a63')]),
            rad(P + 'planet', [(0, '#4fd1ff', 0.55), (1, '#4fd1ff', 0)]),
            lin(P + 'ground', [(0, '#12395c'), (1, '#071626')]),
            vig(P + 'vig', 0.55)]
    b = ['<circle cx="240" cy="300" r="190" fill="url(#%sground)"/>' % P,
         '<circle cx="240" cy="300" r="190" fill="none" stroke="#5fe0ff" stroke-width="2" opacity="0.35"/>']
    b += stars(rnd, 46, 0, 150)
    b.append('<circle cx="392" cy="54" r="66" fill="url(#%splanet)"/>' % P)
    b.append('<circle cx="392" cy="54" r="26" fill="#bfe9ff" opacity="0.7"/>')
    for (cx, cy, s) in [(96, 168, 34), (150, 132, 22), (330, 148, 28), (392, 186, 20), (252, 96, 18), (56, 214, 24)]:
        top = s * 0.55
        b.append('<polygon points="%d,%d %d,%d %d,%d %d,%d" fill="#3fd7b3"/>'
                 % (cx, cy, cx + s, cy - top, cx, cy - top * 2, cx - s, cy - top))
        b.append('<polygon points="%d,%d %d,%d %d,%d %d,%d" fill="#1c8f7d"/>'
                 % (cx - s, cy - top, cx, cy, cx, cy + s * 0.9, cx - s, cy - top + s * 0.9))
        b.append('<polygon points="%d,%d %d,%d %d,%d %d,%d" fill="#12655c"/>'
                 % (cx, cy, cx + s, cy - top, cx + s, cy - top + s * 0.9, cx, cy + s * 0.9))
    b.append('<g transform="translate(214 208) scale(1.4)">%s</g>' % humanoid('#061420', 'reach', 'stand'))
    b.append('<path d="M232 196 L300 158" stroke="#8ef7ff" stroke-width="5" opacity="0.85"/>')
    b.append('<path d="M232 196 L300 158" stroke="#ffffff" stroke-width="2" opacity="0.9"/>')
    b.append('<circle cx="300" cy="158" r="12" fill="#d9fbff" opacity="0.9"/>')
    for _ in range(10):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="#9ff0ff" opacity="%s"/>'
                 % (rnd.randint(240, 316), rnd.randint(140, 196), rnd.choice([1, 1.6, 2.2]), rnd.choice([0.5, 0.8])))
    return doc(P, defs, b)


def rp_city():
    P = 'a6'
    rnd = random.Random(6)
    defs = [lin(P + 'sky', [(0, '#5ea7e0'), (0.55, '#9fd2ef'), (1, '#e7d7b9')]),
            rad(P + 'sun', [(0, '#fff6d6', 0.85), (1, '#fff6d6', 0)]),
            lin(P + 'road', [(0, '#3a3f48'), (1, '#22262d')]),
            vig(P + 'vig', 0.35)]
    b = ['<circle cx="368" cy="52" r="88" fill="url(#%ssun)"/>' % P,
         '<circle cx="368" cy="52" r="26" fill="#fffdf2" opacity="0.9"/>']
    for i in range(3):
        b.append('<ellipse cx="%d" cy="%d" rx="%d" ry="12" fill="#ffffff" opacity="0.55"/>'
                 % (60 + i * 150, 50 + i * 14, 44 + i * 10))
    for (x, h, w) in [(0, 96, 52), (56, 132, 40), (100, 78, 46), (150, 118, 42), (196, 66, 54),
                      (254, 108, 38), (296, 84, 48), (348, 126, 36), (388, 92, 44), (436, 116, 44)]:
        b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#8aa6bd"/>' % (x, 176 - h, w, h))
        b.append('<rect x="%d" y="%d" width="%d" height="6" fill="#6c8aa3"/>' % (x, 176 - h, w))
        for wy in range(176 - h + 12, 168, 16):
            for wx in range(x + 6, x + w - 8, 12):
                if rnd.random() < 0.6:
                    b.append('<rect x="%d" y="%d" width="5" height="7" fill="#dfeaf5" opacity="0.8"/>' % (wx, wy))
    b.append('<rect y="176" width="480" height="16" fill="#7d8b96"/>')
    b.append('<rect y="192" width="480" height="78" fill="url(#%sroad)"/>' % P)
    for i in range(6):
        b.append('<rect x="%d" y="226" width="34" height="5" fill="#e9eef3" opacity="0.6"/>' % (12 + i * 82))
    b.append('<path d="M0 192 h480" stroke="#c8d4de" stroke-width="3"/>')
    for x in (52, 386, 440):
        b.append('<rect x="%d" y="128" width="3" height="64" fill="#4a5560"/>' % x)
        b.append('<circle cx="%d" cy="124" r="7" fill="#ffe9a8" opacity="0.9"/>' % x)
        b.append('<circle cx="%d" cy="124" r="15" fill="#ffe9a8" opacity="0.2"/>' % x)
    b.append('<circle cx="88" cy="150" r="22" fill="#4f8a5c"/><circle cx="74" cy="160" r="16" fill="#3e7350"/>')
    b.append('<rect x="86" y="164" width="4" height="28" fill="#584334"/>')
    b.append('<g transform="translate(206 218) scale(1.45)">%s</g>' % humanoid('#2b323b', 'd', 'stand'))
    b.append('<g transform="translate(268 218) scale(1.35)">%s</g>' % humanoid('#39424d', 'd', 'stand'))
    b.append('<rect x="236" y="150" width="34" height="20" rx="7" fill="#ffffff" opacity="0.92"/>')
    b.append('<circle cx="245" cy="160" r="2.2" fill="#5b6672"/><circle cx="253" cy="160" r="2.2" fill="#5b6672"/><circle cx="261" cy="160" r="2.2" fill="#5b6672"/>')
    b.append('<path d="M252 170 l6 6 -6 0z" fill="#ffffff" opacity="0.92"/>')
    b.append('<path d="M0 270 L0 236 Q80 228 150 242 L150 270 Z" fill="#1c2128"/>')
    return doc(P, defs, b)


def deepwater():
    P = 'a7'
    rnd = random.Random(7)
    defs = [lin(P + 'sky', [(0, '#0e6f8c'), (0.4, '#0a4a68'), (1, '#031a2b')]),
            rad(P + 'light', [(0, '#bdf4ff', 0.5), (1, '#bdf4ff', 0)]),
            vig(P + 'vig', 0.5)]
    b = ['<circle cx="210" cy="10" r="120" fill="url(#%slight)"/>' % P]
    for i in range(6):
        b.append('<polygon points="%d,0 %d,0 %d,270 %d,270" fill="#9fe9ff" opacity="0.06"/>'
                 % (60 + i * 70, 92 + i * 70, 140 + i * 74, 96 + i * 70))
    b.append('<path d="M0 232 Q120 214 240 230 T480 224 L480 270 L0 270 Z" fill="#06222f"/>')
    b.append('<path d="M0 244 Q120 228 240 244 T480 238" stroke="#1b5566" stroke-width="3" fill="none" opacity="0.7"/>')
    for _ in range(4):
        b.append('<ellipse cx="%d" cy="%d" rx="%d" ry="8" fill="#0a3243"/>'
                 % (rnd.randint(20, 460), rnd.randint(238, 258), rnd.randint(16, 34)))
    b.append('<path d="M318 236 L470 236 L470 206 Q430 196 396 208 L360 214 Q336 220 318 236 Z" fill="#071d28"/>')
    b.append('<rect x="392" y="180" width="6" height="34" fill="#0a2734"/>')
    b.append('<path d="M356 206 Q390 194 424 204" stroke="#0d3444" stroke-width="7" fill="none"/>')
    b.append('<g transform="translate(190 208) scale(1.5)">%s</g>' % humanoid('#04121c', 'reach', 'wide'))
    b.append('<path d="M203 210 q-24 10 -34 20 q20 -2 34 -8z" fill="#04121c"/>')
    b.append('<path d="M218 210 q22 8 32 20 q-20 -4 -32 -10z" fill="#04121c"/>')
    b.append('<rect x="176" y="182" width="30" height="16" rx="8" fill="#04121c"/>')
    b.append('<circle cx="196" cy="190" r="7" fill="#9fe9ff" opacity="0.55"/>')
    for i in range(6):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#c8f4ff" stroke-width="1.2" opacity="0.5"/>'
                 % (204 + rnd.randint(-6, 12), 172 - i * 16, 2 + i * 1.4))
    for _ in range(9):
        fx, fy, fs = rnd.randint(40, 300), rnd.randint(96, 190), rnd.choice([6, 8, 10])
        b.append('<path d="M%d %d l%d -%d l%d %dz" fill="#7fd7e8" opacity="0.5"/>' % (fx, fy, fs, fs // 2, fs, fs // 2))
    return doc(P, defs, b)


def pixel_farm():
    P = 'a8'
    rnd = random.Random(8)
    defs = [lin(P + 'sky', [(0, '#2f2350'), (0.42, '#8a4a63'), (0.72, '#e08a54'), (1, '#f7c178')]),
            rad(P + 'sun', [(0, '#ffe2a1', 0.85), (1, '#ffb066', 0)]),
            lin(P + 'field', [(0, '#8a5a2c'), (1, '#3a2414')]),
            vig(P + 'vig', 0.4)]
    b = ['<circle cx="352" cy="128" r="96" fill="url(#%ssun)"/>' % P,
         '<circle cx="352" cy="128" r="30" fill="#fff2c9" opacity="0.9"/>',
         '<path d="M0 150 Q120 126 240 146 T480 140 L480 168 L0 168 Z" fill="#6a4a6a" opacity="0.75"/>',
         '<rect y="160" width="480" height="34" fill="#5e6b3a"/>',
         '<path d="M0 168 L480 168 L480 270 L0 270 Z" fill="url(#%sfield)"/>' % P]
    for i in range(9):
        y = 176 + i * 11
        b.append('<path d="M0 %d Q240 %d 480 %d" stroke="#a8743c" stroke-width="%s" fill="none" opacity="0.55"/>'
                 % (y, y + 4, y, 1 + i * 0.5))
    b.append('<rect x="52" y="118" width="104" height="54" fill="#8d3f34"/>')
    b.append('<polygon points="44,120 104,84 164,120" fill="#5f2a24"/>')
    b.append('<rect x="92" y="140" width="26" height="32" fill="#40201a"/>')
    b.append('<rect x="62" y="132" width="14" height="14" fill="#f2d38a"/>')
    b.append('<rect x="134" y="132" width="14" height="14" fill="#f2d38a"/>')
    b.append('<rect x="104" y="92" width="8" height="18" fill="#40201a"/>')
    b.append('<rect x="24" y="176" width="432" height="4" fill="#d9c39a" opacity="0.5"/>')
    for x in range(24, 460, 34):
        b.append('<rect x="%d" y="160" width="4" height="26" fill="#6b4a2c"/>' % x)
    for _ in range(6):
        b.append('<circle cx="%d" cy="%d" r="2" fill="#e8d9a8" opacity="0.6"/>'
                 % (rnd.randint(120, 460), rnd.randint(20, 90)))
    b.append('<g transform="translate(236 220) scale(1.5)">%s</g>' % humanoid('#33210f', 'd', 'stand'))
    b.append('<path d="M226 200 h22 v4 h-22z" fill="#33210f"/>')
    b.append('<circle cx="286" cy="228" r="8" fill="#f2f0e2"/>')
    b.append('<circle cx="284" cy="224" r="5" fill="#f2f0e2"/>')
    b.append('<path d="M292 226 l7 -4 -1 5z" fill="#e0a63c"/>')
    b.append('<rect x="282" y="234" width="2" height="6" fill="#e0a63c"/><rect x="290" y="234" width="2" height="6" fill="#e0a63c"/>')
    b.append('<path d="M0 270 L0 240 Q90 232 170 246 L170 270 Z" fill="#2b1a0e"/>')
    b.append('<path d="M480 270 L480 236 Q400 230 350 248 L350 270 Z" fill="#2b1a0e"/>')
    return doc(P, defs, b)


def neon_drift():
    P = 'a9'
    rnd = random.Random(9)
    defs = [lin(P + 'sky', [(0, '#180b33'), (0.45, '#4a1454'), (0.72, '#a32a63'), (1, '#e8567a')]),
            rad(P + 'sun', [(0, '#ffd36e', 0.95), (1, '#ff5f9e', 0)]),
            lin(P + 'road', [(0, '#1a0f2b'), (1, '#07040f')]),
            vig(P + 'vig', 0.55)]
    b = ['<circle cx="240" cy="132" r="112" fill="url(#%ssun)"/>' % P,
         '<circle cx="240" cy="132" r="62" fill="#ffe08a" opacity="0.95"/>']
    for i in range(5):
        b.append('<rect x="150" y="%d" width="180" height="%d" fill="#3d1542" opacity="0.85"/>' % (110 + i * 12, 3 + i))
    b.append('<path d="M0 150 L480 150 L480 158 L0 158 Z" fill="#ff8ec4" opacity="0.7"/>')
    b.append('<rect y="156" width="480" height="114" fill="url(#%sroad)"/>' % P)
    for i in range(1, 9):
        b.append('<line x1="%.0f" y1="270" x2="%.0f" y2="158" stroke="#ff54b0" stroke-width="1.6" opacity="0.5"/>'
                 % (240 + (i - 4.5) * 46, 240 + (i - 4.5) * 6))
    y, step = 160, 8
    while y < 270:
        b.append('<line x1="0" y1="%d" x2="480" y2="%d" stroke="#ff7ed0" stroke-width="1.2" opacity="0.4"/>' % (y, y))
        y += step
        step *= 1.35
    b.append('<path d="M156 270 L156 196 Q200 186 240 188 Q280 186 324 196 L324 270 Z" fill="#08040f" opacity="0.55"/>')
    b.append('<path d="M172 250 q68 -26 136 0 l-8 20 q-60 -18 -120 0z" fill="#0b0616"/>')
    b.append('<path d="M186 214 q54 -16 108 0 l-6 30 q-48 -12 -96 0z" fill="#120a22"/>')
    b.append('<path d="M198 200 q42 -10 84 0 l-4 14 q-38 -8 -76 0z" fill="#1b1030"/>')
    b.append('<path d="M186 244 h108 l-4 8 h-100z" fill="#ff3fa4" opacity="0.8"/>')
    b.append('<ellipse cx="240" cy="258" rx="62" ry="10" fill="#ff3fa4" opacity="0.35"/>')
    b.append('<rect x="196" y="228" width="16" height="5" rx="2" fill="#ffd36e"/>')
    b.append('<rect x="268" y="228" width="16" height="5" rx="2" fill="#ffd36e"/>')
    for side in (0, 1):
        bx = 34 if side == 0 else 446
        b.append('<rect x="%d" y="150" width="6" height="108" fill="#12061f"/>' % bx)
        for k in range(4):
            b.append('<path d="M%d %d q%d -14 %d 6" stroke="#12061f" stroke-width="7" fill="none"/>'
                     % (bx + 3, 156 + k * 4, (-1) ** (k % 2) * 34, (-1) ** (k % 2) * 48))
    for _ in range(14):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="#ffe7a8" opacity="%s"/>'
                 % (rnd.randint(10, 470), rnd.randint(20, 130), rnd.choice([1, 1.5]), rnd.choice([0.4, 0.7])))
    return doc(P, defs, b)


def city_of_ashfall():
    P = 'a10'
    rnd = random.Random(10)
    defs = [lin(P + 'sky', [(0, '#2b2620'), (0.5, '#5b4535'), (1, '#9c6a45')]),
            rad(P + 'sun', [(0, '#ffb06a', 0.55), (1, '#ffb06a', 0)]),
            vig(P + 'vig', 0.6)]
    b = ['<circle cx="300" cy="120" r="140" fill="url(#%ssun)"/>' % P,
         '<circle cx="300" cy="120" r="26" fill="#ffd9a8" opacity="0.5"/>']
    for (x, h, w) in [(0, 64, 76), (70, 110, 46), (120, 52, 58), (182, 88, 40), (228, 128, 54),
                      (290, 74, 44), (340, 100, 62), (408, 58, 70)]:
        b.append('<path d="M%d 172 h%d v-%d l-%d -8 l-%d 6 v%d z" fill="#2a2320"/>'
                 % (x, w, h - 10, w // 3, w // 4, h - 4))
        for wy in range(172 - h + 16, 166, 18):
            for wx in range(x + 6, x + w - 8, 14):
                if rnd.random() < 0.35:
                    b.append('<rect x="%d" y="%d" width="5" height="8" fill="#ffbf7a" opacity="%s"/>'
                             % (wx, wy, rnd.choice([0.25, 0.5])))
    b.append('<rect y="172" width="480" height="98" fill="#1d1815"/>')
    b.append('<path d="M0 172 Q120 164 240 172 T480 168" stroke="#6b5340" stroke-width="2" fill="none" opacity="0.7"/>')
    for i in range(4):
        b.append('<path d="M%d 170 q14 -40 4 -66 q-12 26 -18 66z" fill="#7c6552" opacity="0.35"/>' % (60 + i * 118))
    b.append('<path d="M0 270 L0 232 Q80 220 160 238 L160 270 Z" fill="#14100e"/>')
    b.append('<path d="M480 270 L480 226 Q410 220 356 240 L356 270 Z" fill="#14100e"/>')
    b.append('<g transform="translate(250 236) scale(1.5)">%s</g>' % humanoid('#0d0a08', 'd', 'stand'))
    b.append('<rect x="214" y="204" width="3" height="18" fill="#0d0a08"/>')
    b.append('<circle cx="216" cy="202" r="7" fill="#ffca7a" opacity="0.95"/>')
    b.append('<circle cx="216" cy="202" r="20" fill="#ffb062" opacity="0.25"/>')
    for _ in range(26):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="%s" opacity="%s"/>'
                 % (rnd.randint(0, 480), rnd.randint(10, 220), rnd.choice([1, 1.6, 2.2]),
                    rnd.choice(['#ffb066', '#ffd9a8', '#8d8078']), rnd.choice([0.3, 0.55, 0.8])))
    return doc(P, defs, b)


def hollow_night():
    P = 'a11'
    rnd = random.Random(11)
    defs = [lin(P + 'sky', [(0, '#070c1c'), (0.5, '#122036'), (1, '#1d3049')]),
            rad(P + 'moon', [(0, '#e8f1ff', 0.9), (0.55, '#c8dcff', 0.25), (1, '#c8dcff', 0)]),
            lin(P + 'field', [(0, '#101b2b'), (1, '#070d16')]),
            vig(P + 'vig', 0.55)]
    b = ['<circle cx="352" cy="70" r="96" fill="url(#%smoon)"/>' % P,
         '<circle cx="352" cy="70" r="34" fill="#f4f8ff" opacity="0.95"/>',
         '<circle cx="342" cy="62" r="6" fill="#c8d6ee" opacity="0.6"/>',
         '<circle cx="362" cy="80" r="4" fill="#c8d6ee" opacity="0.5"/>']
    b += stars(rnd, 34, 0, 130)
    b.append('<path d="M0 158 L480 158 L480 270 L0 270 Z" fill="url(#%sfield)"/>' % P)
    for i in range(7):
        b.append('<line x1="%d" y1="270" x2="%d" y2="158" stroke="#3a5273" stroke-width="1" opacity="0.45"/>'
                 % (i * 80, 120 + i * 40))
    for i in range(5):
        y = 166 + i * 12
        b.append('<line x1="0" y1="%d" x2="480" y2="%d" stroke="#3a5273" stroke-width="1" opacity="0.35"/>' % (y, y))
    b.append('<ellipse cx="240" cy="200" rx="180" ry="18" fill="#8fb4e8" opacity="0.1"/>')
    for i in range(3):
        b.append('<rect x="%d" y="120" width="3" height="60" fill="#26374d"/>' % (40 + i * 400))
        b.append('<path d="M%d 120 h26 v18 h-26z" fill="#8f2f3f" opacity="0.85"/>' % (40 + i * 400))
    b.append('<g transform="translate(240 232) scale(1.7)">%s</g>' % humanoid('#070b14', 'sword', 'wide'))
    b.append('<path d="M228 200 q12 -18 24 0 q-12 8 -24 0z" fill="#070b14"/>')
    b.append('<line x1="266" y1="196" x2="308" y2="152" stroke="#dfe9ff" stroke-width="3"/>')
    b.append('<line x1="214" y1="196" x2="172" y2="152" stroke="#dfe9ff" stroke-width="3"/>')
    b.append('<path d="M0 270 L0 238 Q70 230 130 244 L130 270 Z" fill="#050910"/>')
    b.append('<path d="M480 270 L480 234 Q420 228 370 246 L370 270 Z" fill="#050910"/>')
    return doc(P, defs, b)


def starship():
    P = 'a12'
    rnd = random.Random(12)
    defs = [lin(P + 'sky', [(0, '#03040f'), (0.5, '#0a1230'), (1, '#132048')]),
            rad(P + 'neb', [(0, '#6f8fff', 0.35), (1, '#6f8fff', 0)]),
            rad(P + 'planet', [(0, '#7fd7ff', 0.6), (1, '#2a6fa8', 0)]),
            vig(P + 'vig', 0.55)]
    b = ['<circle cx="360" cy="90" r="150" fill="url(#%sneb)"/>' % P]
    b += stars(rnd, 80, 0, 270)
    b.append('<circle cx="392" cy="188" r="96" fill="url(#%splanet)"/>' % P)
    b.append('<circle cx="392" cy="188" r="60" fill="#4aa8e0" opacity="0.85"/>')
    b.append('<path d="M312 196 q60 -22 120 0" stroke="#cfe8ff" stroke-width="2" fill="none" opacity="0.5"/>')
    b.append('<ellipse cx="392" cy="188" rx="128" ry="26" fill="none" stroke="#cfe8ff" stroke-width="5" opacity="0.45" transform="rotate(-18 392 188)"/>')
    b.append('<ellipse cx="392" cy="188" rx="140" ry="30" fill="none" stroke="#cfe8ff" stroke-width="2" opacity="0.3" transform="rotate(-18 392 188)"/>')
    b.append('<path d="M96 176 L188 132 L232 148 L198 170 L150 196 L108 196 Z" fill="#c9d6e8"/>')
    b.append('<path d="M96 176 L150 196 L108 196 Z" fill="#8fa2bb"/>')
    b.append('<path d="M188 132 L214 120 L226 132 L232 148 Z" fill="#e8f2ff"/>')
    b.append('<path d="M150 196 L158 206 L136 200 Z" fill="#9fb0c6"/>')
    b.append('<circle cx="164" cy="172" r="7" fill="#2a3a52"/>')
    b.append('<circle cx="172" cy="168" r="7" fill="#7fe6ff" opacity="0.9"/>')
    b.append('<path d="M96 176 L56 190 L84 196 L104 192 Z" fill="#7fe6ff" opacity="0.55"/>')
    b.append('<path d="M60 190 L18 208 L74 202 Z" fill="#7fe6ff" opacity="0.25"/>')
    for i in range(7):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="#9ff0ff" opacity="%s"/>'
                 % (78 - i * 12, 192 + i * 4, 2.6 - i * 0.25, 0.5 - i * 0.06))
    b.append('<path d="M0 270 L0 244 Q90 236 180 248 L180 270 Z" fill="#05070f"/>')
    return doc(P, defs, b)


def skyforge():
    P = 'a13'
    rnd = random.Random(13)
    defs = [lin(P + 'sky', [(0, '#20365e'), (0.45, '#6f86ad'), (0.8, '#e5b98d'), (1, '#f6d7ac')]),
            rad(P + 'forge', [(0, '#ffd08a', 0.85), (1, '#ff9a4d', 0)]),
            vig(P + 'vig', 0.4)]
    b = ['<circle cx="118" cy="182" r="140" fill="url(#%sforge)"/>' % P]
    for i in range(5):
        b.append('<ellipse cx="%d" cy="%d" rx="%d" ry="12" fill="#ffffff" opacity="0.3"/>'
                 % (rnd.randint(0, 470), 96 + i * 22, rnd.randint(50, 110)))
    b.append('<path d="M0 200 Q90 176 180 196 T400 190 L480 200 L480 270 L0 270 Z" fill="#b9c8dc" opacity="0.35"/>')
    for (x, y, w) in [(70, 208, 84), (250, 236, 120), (392, 196, 66)]:
        b.append('<path d="M%d %d q%d -14 %d 0 q%d 40 %d 46 q-%d -8 -%d -46z" fill="#5c6b80"/>'
                 % (x - w // 2, y, w // 2, w, 0, 0, w // 2, w))
        b.append('<ellipse cx="%d" cy="%d" rx="%d" ry="7" fill="#8fa3ba"/>' % (x, y, w // 2))
    b.append('<rect x="214" y="196" width="72" height="10" rx="3" fill="#2f3745"/>')
    b.append('<rect x="222" y="206" width="10" height="26" fill="#3a4353"/>')
    b.append('<rect x="268" y="206" width="10" height="26" fill="#3a4353"/>')
    b.append('<path d="M222 196 l14 -12 h26 l14 12z" fill="#454f61"/>')
    b.append('<path d="M240 176 l6 10 h-12z" fill="#c95d3a"/>')
    b.append('<circle cx="246" cy="186" r="16" fill="#ffb066" opacity="0.5"/>')
    b.append('<g transform="translate(168 236) scale(1.35)">%s</g>' % humanoid('#232b38', 'raise', 'stand'))
    b.append('<rect x="182" y="196" width="34" height="6" rx="2" fill="#232b38"/>')
    b.append('<rect x="206" y="188" width="8" height="10" fill="#232b38"/>')
    b.append('<path d="M392 138 l66 -22 l16 12 l-70 26z" fill="#39424f"/>')
    b.append('<ellipse cx="404" cy="140" rx="26" ry="9" fill="#4a5563"/>')
    b.append('<path d="M462 138 q18 -6 26 4 q-16 6 -26 -4z" fill="#4a5563"/>')
    for _ in range(14):
        b.append('<circle cx="%d" cy="%d" r="%s" fill="#ffd08a" opacity="%s"/>'
                 % (rnd.randint(200, 300), rnd.randint(120, 190), rnd.choice([1, 1.6]), rnd.choice([0.5, 0.85])))
    for i in range(3):
        b.append('<path d="M%d 92 q6 -6 12 0 q-6 4 -12 0z" fill="#2b3444" opacity="0.7"/>' % (60 + i * 30))
    return doc(P, defs, b)


def iron_vanguard():
    P = 'a14'
    rnd = random.Random(14)
    defs = [lin(P + 'sky', [(0, '#0a0f18'), (0.5, '#1d2a3a'), (1, '#3d4d5f')]),
            rad(P + 'bolt', [(0, '#dff0ff', 0.85), (1, '#dff0ff', 0)]),
            lin(P + 'ground', [(0, '#1a222c'), (1, '#0a0e14')]),
            vig(P + 'vig', 0.6)]
    b = ['<circle cx="318" cy="70" r="130" fill="url(#%sbolt)"/>' % P,
         '<path d="M318 0 l-16 62 l24 -8 l-20 72 l40 -66 l-24 6 l22 -66z" fill="#eaf6ff" opacity="0.8"/>']
    for i in range(4):
        b.append('<path d="M%d 0 Q%d 70 %d 120" stroke="#5d7085" stroke-width="%d" fill="none" opacity="0.5"/>'
                 % (30 + i * 130, 90 + i * 60, 60 + i * 140, 30 - i * 5))
    b.append('<rect y="176" width="480" height="94" fill="url(#%sground)"/>' % P)
    b.append('<path d="M0 176 Q120 168 240 176 T480 172" stroke="#6e8299" stroke-width="2" fill="none" opacity="0.55"/>')
    for i in range(3):
        b.append('<rect x="%d" y="86" width="4" height="92" fill="#26313d"/>' % (36 + i * 408))
        b.append('<path d="M%d 86 l30 10 -30 10z" fill="#7f2b34" opacity="0.9"/>' % (36 + i * 408))
    b.append('<ellipse cx="240" cy="248" rx="110" ry="20" fill="#000" opacity="0.35"/>')
    b.append('<g transform="translate(240 240) scale(1.9)">%s</g>' % humanoid('#080c12', 'sword', 'wide'))
    b.append('<path d="M214 206 h48 v34 q-24 12 -48 0z" fill="#141c26"/>')
    b.append('<path d="M238 208 v30" stroke="#9fb3c9" stroke-width="2" opacity="0.7"/>')
    b.append('<circle cx="238" cy="224" r="7" fill="#9fb3c9" opacity="0.75"/>')
    b.append('<path d="M238 192 q18 -6 26 -18 q-6 20 -26 26z" fill="#080c12"/>')
    b.append('<line x1="262" y1="200" x2="306" y2="150" stroke="#cfdff0" stroke-width="4"/>')
    b.append('<path d="M300 156 l12 -14 6 8 -10 12z" fill="#eef7ff"/>')
    for i in range(22):
        x1, y1 = rnd.uniform(0, 480), rnd.uniform(0, 200)
        b.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#bcd4ea" stroke-width="1" opacity="0.16"/>'
                 % (x1, y1, x1 - 4, y1 + 20))
    b.append('<path d="M0 270 L0 240 Q70 232 130 246 L130 270 Z" fill="#070a0f"/>')
    b.append('<path d="M480 270 L480 236 Q420 230 372 248 L372 270 Z" fill="#070a0f"/>')
    return doc(P, defs, b)


POSTERS = {
    1: cyber_raven, 2: obby_sprint, 3: rift_hunters, 4: obsidian_arena,
    5: void_crafters, 6: rp_city, 7: deepwater, 8: pixel_farm,
    9: neon_drift, 10: city_of_ashfall, 11: hollow_night, 12: starship,
    13: skyforge, 14: iron_vanguard,
}

for number, build in POSTERS.items():
    svg = build()
    ids = set(re.findall(r'id="([^"]+)"', svg))
    missing = set(re.findall(r'url\(#([^)]+)\)', svg)) - ids
    if missing:
        raise SystemExit('game-%d: unresolved %s' % (number, missing))
    if re.search(r'</?(?:lineargradient|radialgradient|clippath)\b', svg):
        raise SystemExit('game-%d: lowercase gradient tag' % number)
    path = OUT / ('game-%d.svg' % number)
    path.write_text(svg + '\n', encoding='utf-8')
    print('%-16s %5d bytes' % (path, len(svg)))

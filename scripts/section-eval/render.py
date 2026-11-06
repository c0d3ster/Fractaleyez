import sys, json, zlib, struct
import numpy as np

SECTION_COLORS = {
    'intro': (80, 200, 220), 'quiet': (110, 120, 140), 'groove': (80, 170, 110), 'buildup': (245, 200, 60),
    'break': (80, 130, 230), 'drop': (240, 70, 100), 'outro': (170, 110, 220),
}
PX = 2  # pixels per 250 ms slot

def png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))

def cmap(v):
    # v in 0..1 -> dark blue -> purple -> orange -> yellow/white
    v = np.clip(v, 0, 1)
    r = np.clip(v * 2.2 - 0.3, 0, 1) * 255
    g = np.clip(v * 2.0 - 0.9, 0, 1) * 255
    b = np.clip(0.25 + v * 1.4 - v * v * 1.6, 0, 1) * 200
    return np.stack([r, g, b], axis=-1).astype(np.uint8)

DIGITS = {
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],
 '3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
 '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],
 '9':['111','101','111','001','111'],':':['0','1','0','1','0']}

def text(img, x, y, s, scale=2, color=(255, 255, 255)):
    for ch in s:
        g = DIGITS.get(ch)
        if g is None: continue
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit == '1':
                    img[y + r * scale:y + (r + 1) * scale, x + c * scale:x + (c + 1) * scale] = color
        x += (len(g[0]) + 1) * scale

def smooth(x, k=4):
    return np.convolve(np.pad(x, (k // 2, k - k // 2 - 1), mode='edge'), np.ones(k) / k, mode='valid')[:len(x)]

def line_panel(slots, w, h=150):
    n = len(slots)
    bands = np.array([s['bands'] for s in slots]).T
    series = [
        ('low', smooth((bands[0] + bands[1]) / 2, 4), (255, 90, 90)),
        ('high', smooth((bands[3] + bands[4]) / 2, 4), (90, 200, 255)),
        ('all', smooth(bands.mean(axis=0), 4), (255, 255, 255)),
    ]
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for k in range(0, h, 30): img[k, :] = (40, 40, 40)
    for name, x, color in series:
        db = 20 * np.log10(np.maximum(x, 1e-3))
        lo, hi = np.percentile(db, 2), np.percentile(db, 99.7)
        y = np.clip((db - lo) / max(hi - lo, 1e-6), 0, 1)
        py = (h - 1 - y * (h - 6)).astype(int) - 2
        for i in range(n):
            x0 = i * PX
            y1 = py[i]
            y0 = py[i - 1] if i > 0 else y1
            a, b = min(y0, y1), max(y0, y1)
            img[a:b + 1, x0:x0 + PX] = color
    return img

def render(src, dst):
    d = json.load(open(src))
    slots = d['slots']
    n = len(slots)
    bands = np.array([s['bands'] for s in slots]).T  # 5 x n
    w = n * PX
    band_h, strip_h, tick_h = 30, 14, 18
    rows = []
    # bands: air on top, bass at the bottom; each scaled by its own loud end, in dB
    for b in [4, 3, 2, 1, 0]:
        x = bands[b]
        xs = np.convolve(np.pad(x, (2, 2), mode='edge'), np.ones(5) / 5, mode='valid')[:n]
        db = 20 * np.log10(np.maximum(xs, 1e-3))
        lo, hi = np.percentile(db, 3), np.percentile(db, 99.5)
        v = (db - lo) / max(hi - lo, 1e-6)
        row = cmap(np.repeat(v, PX))
        rows.append(np.repeat(row[None], band_h, axis=0))
    # smoothed beat density, 0..4 beats per second
    beats = np.array([s['beats'] for s in slots], dtype=float) * 4
    k = np.ones(8) / 8
    dens = np.convolve(beats, k, mode='same')
    v = np.clip(dens / max(np.percentile(dens, 99), 1e-6), 0, 1)
    row = (np.stack([v * 255, v * 255, v * 255], axis=-1)).astype(np.uint8)
    rows.append(np.repeat(np.repeat(row, PX, axis=0)[None], strip_h, axis=0))
    # sections
    sec = np.array([SECTION_COLORS.get(s['section'], (0, 0, 0)) for s in slots], dtype=np.uint8)
    rows.append(np.repeat(np.repeat(sec, PX, axis=0)[None], strip_h + 6, axis=0))
    # song index changes: white tick marks above the section strip
    ticks = np.zeros((tick_h, w, 3), dtype=np.uint8)
    for i, s in enumerate(slots):
        sec_t = s['t']
        if abs(sec_t - round(sec_t / 10) * 10) < 0.13 and round(sec_t / 10) * 10 > 0:
            big = round(sec_t / 10) * 10
            length = 18 if big % 60 == 0 else (11 if big % 30 == 0 else 5)
            ticks[:length, i * PX:i * PX + 1] = 255
        if i > 0 and s['song'] != slots[i - 1]['song']:
            ticks[:, i * PX:i * PX + 3] = (255, 60, 60)
    rows.append(ticks)
    body = np.concatenate(rows, axis=0)
    lines = line_panel(slots, w)
    img = np.concatenate([lines, body], axis=0)
    # minute numbers on the line panel, so a time can be read straight off it
    for i, sl in enumerate(slots):
        sec_t = sl['t']
        if abs(sec_t - round(sec_t / 30) * 30) < 0.13 and round(sec_t / 30) * 30 > 0:
            tt = int(round(sec_t / 30) * 30)
            text(img, i * PX + 3, 4, f"{tt // 60}:{tt % 60:02d}", 2, (200, 200, 200))
            img[:, i * PX:i * PX + 1] = np.maximum(img[:, i * PX:i * PX + 1], 35)
    png(dst, img)
    return img.shape

if __name__ == '__main__':
    print(render(sys.argv[1], sys.argv[2]))

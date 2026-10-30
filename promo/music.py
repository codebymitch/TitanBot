"""Soundtrack for a CHAOS promo video, synthesized from scratch (no samples, no copyright issues).

    python3 music.py v1-main.html out/v1-main.wav

120 BPM dark trap/EDM loop in A minor, with a whoosh before every cut and an impact on the times
listed in the page's <body data-hits="3.5,19.5">. The length and the cuts come from the HTML
(body data-duration, .scene data-start), so the music always follows the video.
"""
import re
import sys
import wave

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)


def env(n, attack=0.002, decay=0.2):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t / decay)


def filt(x, kind, freq, order=2):
    b, a = butter(order, np.array(freq) / (SR / 2), btype=kind)
    return lfilter(b, a, x)


def kick():
    n = int(SR * 0.45)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = filt(rng.standard_normal(n), 'high', 2000) * np.exp(-t / 0.004) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(SR * 0.3)
    x = filt(rng.standard_normal(n), 'band', [900, 3500])
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        k = int(off * SR)
        e[k:] += env(n - k, 0.001, 0.09 if off == 0.022 else 0.012)
    return x * e * 0.9


def hat(open_=False):
    n = int(SR * (0.25 if open_ else 0.06))
    return filt(rng.standard_normal(n), 'high', 7000) * env(n, 0.001, 0.08 if open_ else 0.018) * 0.35


def saw(freq, n):
    t = np.arange(n) / SR
    return 2 * ((t * freq) % 1) - 1


def bass(freq, dur):
    n = int(SR * dur)
    x = 0.7 * np.sin(2 * np.pi * freq * np.arange(n) / SR) + 0.3 * filt(saw(freq, n), 'low', 400)
    return np.tanh(x * 1.5) * env(n, 0.004, dur * 0.7) * 0.8


def pluck(freq, dur):
    n = int(SR * dur)
    x = saw(freq, n) * 0.5 + saw(freq * 1.005, n) * 0.5
    return filt(x, 'low', 2600) * env(n, 0.002, 0.12) * 0.22


def whoosh(dur=0.5):
    n = int(SR * dur)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 16
    for i in range(steps):  # rising band-pass, crossfaded in chunks
        a, b = i * n // steps, (i + 1) * n // steps
        lo = 300 * (1 + i * 1.2)
        out[a:b] = filt(x, 'band', [lo, min(lo * 3, 16000)])[a:b]
    return out * np.linspace(0, 1, n) ** 2 * 0.5


def impact():
    n = int(SR * 2.2)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.7)
    crash = filt(rng.standard_normal(n), 'high', 3000) * np.exp(-t / 0.5) * 0.35
    return np.tanh((boom + crash) * 1.8) * 0.9


def add(buf, clip, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf) or i + len(clip) <= 0:
        return
    j = min(len(buf), i + len(clip))
    s = max(0, -i)
    buf[max(i, 0):j] += clip[s:j - i] * gain


NOTES = {'A1': 55.0, 'F1': 43.65, 'C2': 65.41, 'G1': 49.0}
PROG = ['A1', 'F1', 'C2', 'G1']
ARP = {'A1': [0, 3, 7, 12], 'F1': [0, 4, 7, 12], 'C2': [0, 4, 7, 12], 'G1': [0, 4, 7, 10]}


def build(duration, cuts, hits):
    total = duration + 1.5
    drums = np.zeros(int(SR * total))
    music = np.zeros_like(drums)
    fx = np.zeros_like(drums)
    end = duration - 0.6  # the beat stops just before the end, the last impact rings out
    k, c, oh = kick(), clap(), hat(True)
    beats = int(end / BEAT)
    for b in range(beats):
        t = b * BEAT
        intro = t < 2.0  # half-time intro: tension under the hook
        if not intro or b % 2 == 0:
            add(drums, k, t)
        if b % 2 == 1 and not intro:
            add(drums, c, t, 0.8)
        for s in range(2 if not intro else 1):
            add(drums, hat(), t + s * BEAT / 2, 0.9 if s else 0.6)
        if b % 4 == 3 and not intro:
            add(drums, oh, t + BEAT / 2, 0.6)
    bar = BEAT * 4
    for i in range(int(end / bar) + 1):
        root = PROG[i % 4]
        f = NOTES[root]
        for e in range(8):  # eighth-note bass
            t = i * bar + e * BEAT / 2
            if t < end:
                add(music, bass(f, BEAT / 2), t, 0.9 if e % 2 == 0 else 0.6)
        for s in range(16):  # sixteenth-note arp, two octaves up
            t = i * bar + s * BEAT / 4
            if t < end and t >= 2.0:
                semis = ARP[root][s % 4]
                add(music, pluck(f * 4 * 2 ** (semis / 12), BEAT / 4), t)
    for cut in cuts:
        if cut > 0:
            add(fx, whoosh(0.5), cut - 0.5, 0.8)
    for h in hits:
        add(fx, impact(), h, 1.0)
    # Sidechain-style ducking of the music on every kick for pump.
    duck = np.ones_like(music)
    for b in range(beats):
        i = int(b * BEAT * SR)
        n = int(0.18 * SR)
        j = min(len(duck), i + n)
        duck[i:j] = np.minimum(duck[i:j], 0.35 + 0.65 * np.linspace(0, 1, j - i))
    mix = drums * 0.9 + music * duck * 0.8 + fx
    fade = int(SR * 1.2)
    mix[-fade:] *= np.linspace(1, 0, fade)
    # Gentle saturation; render.mjs then normalizes to -14 LUFS / -1.5 dBTP, the level TikTok / Reels /
    # Shorts normalize to, so the platforms don't squash it further.
    mix /= np.max(np.abs(mix))
    mix = np.tanh(mix * 1.4)
    mix /= np.max(np.abs(mix)) / 0.8
    return mix


def main():
    html, out = sys.argv[1], sys.argv[2]
    src = open(html, encoding='utf-8').read()
    duration = float(re.search(r'data-duration="([\d.]+)"', src).group(1))
    cuts = [float(x) for x in re.findall(r'class="scene"[^>]*data-start="([\d.]+)"', src)]
    m = re.search(r'data-hits="([\d.,]+)"', src)
    hits = [float(x) for x in m.group(1).split(',')] if m else []
    mix = build(duration, cuts, hits)
    stereo = np.stack([mix, mix], axis=1)
    pcm = (stereo * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'{out}: {duration}s, cuts {cuts}, hits {hits}')


if __name__ == '__main__':
    main()

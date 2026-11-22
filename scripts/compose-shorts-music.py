"""Render three original, instrumental newsroom scores from note patterns.

Usage: python scripts/compose-shorts-music.py (requires numpy and ffmpeg).
No samples, remote services or existing songs are used.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import wave

import numpy as np

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets"

SCORES = (
    {
        "slug": "briefing-pulse", "bpm": 108, "bars": 20, "seed": 17,
        "chords": [(38, 53, 57, 64), (34, 50, 53, 60), (41, 48, 55, 57), (36, 52, 55, 62)],
        "motif": [(0, 2, 12), (.75, 3, 0), (1.5, 1, 12), (2.25, 2, 12), (3.5, 3, 0)],
        "rhythm": [0, 1.5, 2, 3.25], "tone": "mallet", "pad": .095, "bass": .17, "drums": .15,
    },
    {
        "slug": "analysis-desk", "bpm": 88, "bars": 20, "seed": 29,
        "chords": [(45, 55, 60, 64), (41, 52, 57, 60), (36, 55, 59, 62), (43, 53, 57, 62)],
        "motif": [(.25, 2, 12), (1.25, 3, 12), (2.75, 1, 12), (3.5, 2, 12)],
        "rhythm": [0, 2.5], "tone": "felt", "pad": .09, "bass": .137, "drums": .08,
    },
    {
        "slug": "world-in-focus", "bpm": 96, "bars": 24, "seed": 41,
        "chords": [(43, 53, 58, 62), (39, 53, 55, 58), (46, 57, 60, 65), (41, 48, 55, 60)],
        "motif": [(0, 3, 12), (1.75, 2, 12), (3.25, 1, 12)],
        "rhythm": [0, 2.75], "tone": "bell", "pad": .16, "bass": .13, "drums": .085,
    },
)


def render(score, filename):
    beat = 60 / score["bpm"]
    end = score["bars"] * 4 * beat
    mix = np.zeros((round((end + 1.3) * RATE), 2), dtype=np.float64)
    rng = np.random.default_rng(score["seed"])

    def add(start, signal, pan=0):
        first = round(start * RATE)
        last = min(first + len(signal), len(mix))
        if first >= last:
            return
        gain = np.sqrt((np.array([1 - pan, 1 + pan])) / 2)
        mix[first:last] += signal[:last - first, None] * gain

    def note(start, pitch, length, gain, voice, pan=0, echo=False):
        attack, release = {
            "pad": (.58, .95), "bass": (.025, .22), "felt": (.012, .44),
            "mallet": (.006, .26), "bell": (.025, .85),
        }[voice]
        time = np.arange(round((length + release) * RATE)) / RATE
        radians = 2 * np.pi * (440 * 2 ** ((pitch - 69) / 12)) * time
        sin = np.sin
        if voice == "pad":
            signal = .68 * sin(radians) + .22 * sin(1.003 * radians) + .1 * sin(2 * radians)
            signal *= .9 + .1 * sin(2 * np.pi * .7 * time)
        elif voice == "bass":
            signal = .75 * sin(radians) + .19 * sin(radians * 2) + .06 * sin(radians * 3)
        elif voice == "felt":
            signal = (.77 * sin(radians) + .17 * sin(radians * 2) + .06 * sin(radians * 3)) * np.exp(-time * 2.1)
        elif voice == "mallet":
            signal = (.81 * sin(radians) + .14 * sin(radians * 2) + .05 * sin(radians * 4.02)) * np.exp(-time * 4)
        else:
            signal = .78 * sin(radians) * np.exp(-time * 1.7) + .22 * sin(radians * 2.01) * np.exp(-time * 3.7)
        envelope = np.minimum(time / attack, 1) * np.minimum(np.maximum((length + release - time) / release, 0), 1) ** 2
        signal *= envelope * gain
        add(start, signal, pan)
        if echo:
            add(start + beat * .75, signal * .18, -pan * .85)
            add(start + beat * 1.5, signal * .075, pan)

    def hit(start, kind, gain, pan=0):
        if kind == "kick":
            time = np.arange(round(.23 * RATE)) / RATE
            sig = np.sin(2 * np.pi * (47 * time + 42 * .022 * (1 - np.exp(-time / .022)))) * np.exp(-time * 19)
        else:
            time = np.arange(round((.055 if kind == "tick" else .13) * RATE)) / RATE
            noise = rng.standard_normal(len(time))
            color = np.diff(noise, prepend=noise[0]) * .22
            sig = (color + (0 if kind == "tick" else .22 * np.sin(2 * np.pi * 168 * time))) * np.exp(-time * (64 if kind == "tick" else 30))
        add(start, sig * gain * np.minimum(time / .006, 1), pan)

    ch = score["chords"]
    for bar in range(score["bars"]):
        now = bar * 4 * beat
        chord = ch[bar % len(ch)]
        last = bar == score["bars"] - 1
        swell = .70 if bar < 2 or last else (1.12 if 8 <= bar < 16 else .92)
        for j, pitch in enumerate(chord[1:]):
            note(now + j * .043, pitch, 3.65 * beat, score["pad"] * swell / 3, "pad", (j - 1) * .57)
        if bar == 0 or last:
            note(now, chord[0], 2.3 * beat, score["bass"] * .75, "bass")
        else:
            for j, step in enumerate(score["rhythm"]):
                note(now + step * beat, chord[0] + (12 if j == 3 else 0), .46 * beat, score["bass"] * swell * (1 if j == 0 else .65), "bass")
                if j != 3:
                    hit(now + step * beat, "kick", score["drums"] * swell * (1 if j == 0 else .65))
            if bar > 2 and bar % 8 != 5:
                for j, step in enumerate((.5, 1, 1.5, 2.5, 3, 3.5)):
                    hit(now + step * beat, "tick", score["drums"] * (.42 if j % 3 == 0 else .24), (-1 if j % 2 == 0 else 1) * .27)
                hit(now + (2 if score["tone"] == "bell" else 3) * beat, "brush", score["drums"] * .48)
        motif = score["motif"] if bar % 4 != 3 else score["motif"][:2]
        if bar == 0 or last:
            motif = [(0, 2, 12), (2, 1, 12)]
        for j, (step, degree, octave) in enumerate(motif):
            raised = 12 if score["tone"] == "mallet" and 10 <= bar <= 13 and j == 0 else 0
            note(now + step * beat, chord[degree] + octave + raised, (1.1 if score["tone"] == "bell" else .52) * beat,
                 (.102 if j == 0 else .068) * swell, score["tone"], (-1 if j % 2 else 1) * .38, echo=True)

    timeline = np.arange(len(mix)) / RATE
    fades = np.minimum(1, timeline / .44) * np.minimum(1, np.maximum(0, (end + .83 - timeline) / 1.75))
    samples = np.clip(mix * fades[:, None] * 1.2, -1, 1)
    with wave.open(str(filename), "wb") as wav:
        wav.setparams((2, 2, RATE, len(samples), "NONE", "not compressed"))
        wav.writeframes(np.rint(samples * 32767).astype("<i2").tobytes())


def encode(wav, output):
    profile = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "loudnorm=I=-22.5:TP=-3:LRA=9:print_format=json", "-f", "null", "-"],
        check=True, capture_output=True, text=True).stderr
    meter, _ = json.JSONDecoder().raw_decode(profile[profile.rfind("{"):])
    gain = min(-22.5 - float(meter["input_i"]), -3 - float(meter["input_tp"]))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", f"volume={gain:.2f}dB", "-q:a", "5", "-codec:a", "libmp3lame", str(output)], check=True)


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        wav = Path(tmp) / "score.wav"
        for score in SCORES:
            render(score, wav)
            output = OUT / f"shorts-news-{score['slug']}.mp3"
            encode(wav, output)
            print(f"{output.name}: {output.stat().st_size // 1024} KiB")

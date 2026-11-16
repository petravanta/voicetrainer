#!/usr/bin/env python3
"""Pre-render the built-in Readings passages with a neural voice (Kokoro-82M), for the Readings reference.

Writes refclips/<passage id>.<fem|masc>.mp3 and refclips/clips.json (each word's start and end in each clip,
plus a hash of the passage so the app ignores a clip when the passage has changed since).

Needs: pip install kokoro-onnx soundfile onnx, ffmpeg on PATH, and the model files from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 (kokoro-v1.0.onnx, voices-v1.0.bin).
The script adds a 'duration' output to a copy of the model (kokoro-timed.onnx, next to it) so each phoneme's
length, and so each word's start and end, comes straight from the model instead of from a guess.

  python3 scripts/make-refclips.py --model DIR [--only b-rainbow,b-bright] [--fem af_heart] [--masc am_puck]
"""
import argparse, json, os, re, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR, HOP = 24000, 600  # Kokoro: 24 kHz audio, one duration frame per 600 samples (25 ms)
GAP_SENT, GAP_PARA = 0.18, 0.5  # seconds of silence after a sentence and after a paragraph
PUNCT = set(';:,.!?¡¿—…"«»“”()\'')


def timed_model(path):
    """A copy of the model that also outputs each token's length in frames."""
    out = os.path.join(os.path.dirname(path), 'kokoro-timed.onnx')
    if os.path.exists(out):
        return out
    import onnx
    m = onnx.load(path)
    m.graph.node.append(onnx.helper.make_node('Identity', ['/encoder/Clip_output_0'], ['duration']))
    m.graph.output.append(onnx.helper.make_tensor_value_info('duration', onnx.TensorProto.FLOAT, None))
    onnx.save(m, out)
    return out


def body_hash(body):
    """FNV-1a of the passage's UTF-8 bytes, as 8 hex digits (D.textHash in src/dsp.js)."""
    h = 0x811c9dc5
    for b in body.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return f'{h:08x}'


def sentences(words):
    """Group the passage's words (as the app splits them) into sentences, marking paragraph ends."""
    out, cur = [], []
    for i, (w, para_end) in enumerate(words):
        cur.append(i)
        if para_end or re.search(r'[.!?]["\')\]]*$', w) or len(cur) >= 40:
            out.append((cur, para_end)); cur = []
    if cur:
        out.append((cur, True))
    return out


def passage_words(body):
    """The app's words (body.split(/\\s+/)), each with whether a paragraph ends after it."""
    res = []
    for p in re.split(r'\n\s*\n', body.strip()):
        ws = p.split()
        res += [(w, j == len(ws) - 1) for j, w in enumerate(ws)]
    return res


def render(kok, words, voice, speed):
    """Synthesise the passage sentence by sentence; return audio and each word's [start, end] in seconds."""
    tok, vocab = kok.tokenizer, kok.tokenizer.vocab
    space = vocab[' ']
    style_all = kok.voices[voice]
    audio, spans = [], [None] * len(words)
    t = 0  # samples so far
    for idxs, para_end in sentences(words):
        text = ' '.join(words[i][0] for i in idxs)
        chunks = tok.phonemize(text).split(' ')
        if len(chunks) != len(idxs):  # the phonemiser merged or split words: phonemise them one by one
            chunks = [tok.phonemize(words[i][0]) for i in idxs]
        ids, ranges = [], []
        for c in chunks:
            if ids:
                ids.append(space)
            core = [k for k, ch in enumerate(c) if ch not in PUNCT and ch != ' ']
            known = [(ch, vocab.get(ch)) for ch in c]
            a = len(ids)
            first = last = None
            for k, (ch, v) in enumerate(known):
                if v is None:
                    continue
                if core and core[0] <= k <= core[-1]:
                    first = len(ids) if first is None else first
                    last = len(ids)
                ids.append(v)
            ranges.append((first if first is not None else a, (last + 1) if last is not None else len(ids)))
        x, dur = kok._infer(ids, style_all[min(len(ids), len(style_all)) - 1], speed)
        dur = np.asarray(dur).ravel()
        cum = np.concatenate([[0], np.cumsum(dur)])  # cum[j] = frames before token j of [pad, *ids, pad]
        x = np.asarray(x, dtype=np.float32)
        for i, (a, b) in zip(idxs, ranges):
            spans[i] = [round((t + cum[a + 1] * HOP) / SR, 3), round((t + cum[b + 1] * HOP) / SR, 3)]
        gap = np.zeros(int(SR * (GAP_PARA if para_end else GAP_SENT)), np.float32)
        audio += [x, gap]
        t += len(x) + len(gap)
    return np.concatenate(audio), spans


def onset(x, sr):
    """Time of the first sound well above the silence: the app finds it again in the decoded file, to undo
    the encoder's delay whatever the browser does with it."""
    hop = sr // 200
    e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    k = int(np.argmax(e > 0.1 * e.max()))
    return round(k * hop / sr, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True, help='folder with kokoro-v1.0.onnx and voices-v1.0.bin')
    ap.add_argument('--only', default='')
    ap.add_argument('--fem', default='af_heart')
    ap.add_argument('--masc', default='am_puck')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--kbps', type=int, default=48)
    ap.add_argument('--out', default=os.path.join(ROOT, 'refclips'))
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    kok = Kokoro(timed_model(os.path.join(a.model, 'kokoro-v1.0.onnx')), os.path.join(a.model, 'voices-v1.0.bin'))
    texts = json.load(open(os.path.join(ROOT, 'data', 'texts.json'), encoding='utf-8'))
    os.makedirs(a.out, exist_ok=True)
    idx_path = os.path.join(a.out, 'clips.json')
    index = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {'voices': {}, 'clips': {}}
    only = set(filter(None, a.only.split(',')))
    for kind, voice in (('fem', a.fem), ('masc', a.masc)):
        index['voices'][kind] = {'model': 'Kokoro-82M v1.0', 'voice': voice, 'speed': a.speed}
    for t in texts:
        if only and t['id'] not in only:
            continue
        words = passage_words(t['body'])
        assert [w for w, _ in words] == t['body'].split(), t['id']
        for kind, voice in (('fem', a.fem), ('masc', a.masc)):
            x, spans = render(kok, words, voice, a.speed)
            x = x / max(1e-6, np.abs(x).max()) * 0.89
            name = f"{t['id']}.{kind}.mp3"
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                import soundfile as sf
                sf.write(f.name, x, SR, subtype='PCM_16')
                wav = f.name
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame',
                            '-b:a', f'{a.kbps}k', os.path.join(a.out, name)], check=True)
            os.unlink(wav)
            index['clips'][f"{t['id']}.{kind}"] = {'file': name, 'text': t['id'], 'hash': body_hash(t['body']),
                                                  'voice': voice, 'seconds': round(len(x) / SR, 2),
                                                  'onset': onset(x, SR), 'words': spans}
            print(name, f'{len(x) / SR:.1f}s', file=sys.stderr)
    index['clips'] = dict(sorted(index['clips'].items()))
    with open(idx_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    main()

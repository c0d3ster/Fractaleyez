"""Shared by riser-train.py and riser-score.py: reading riser-model.json, running it, and the app's follower (up over 400 ms, down over
150 ms, as in riser.ts and sweep.ts)."""
import json
import os
import subprocess

import numpy as np

RISE_MS = 400
FALL_MS = 150
AUDIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'soundsense', 'src')


def feature_names() -> list[str]:
    """RISER_FEATURE_NAMES from riser.ts, the order drum-eval.mts writes every slot's inputs in."""
    code = "import { RISER_FEATURE_NAMES } from './riser.ts'; console.log(JSON.stringify(RISER_FEATURE_NAMES))"
    out = subprocess.run(['npx', 'tsx', '--eval', code], cwd=AUDIO, capture_output=True, text=True, check=True, shell=os.name == 'nt')
    return json.loads(out.stdout.strip().splitlines()[-1])


def load_model(path: str) -> dict:
    """The model, with `cols`: where each of its inputs sits in a slot's full feature row."""
    m = json.load(open(path))
    names = feature_names()
    return {'cols': [names.index(n) for n in m['features']], 'mean': np.array(m['mean']), 'scale': np.array(m['scale']), 'W1': np.array(m['hidden']['weights']).T,
            'b1': np.array(m['hidden']['bias']), 'W2': np.array(m['output']['weights']).T, 'b2': np.array(m['output']['bias'])}


def predict(model: dict, X: np.ndarray) -> np.ndarray:
    Z = (X[:, model['cols']] - model['mean']) / model['scale']
    S = np.tanh(Z @ model['W1'] + model['b1']) @ model['W2'] + model['b2']
    return (1 / (1 + np.exp(-np.clip(S, -30, 30))))[:, 0]


def smooth(t_ms: np.ndarray, p: np.ndarray) -> np.ndarray:
    out, score, last = np.zeros(len(p)), 0.0, None
    for i, (t, v) in enumerate(zip(t_ms, p)):
        dt = 100 if last is None else t - last
        last = t
        score += (v - score) * (1 - np.exp(-dt / (RISE_MS if v >= score else FALL_MS)))
        out[i] = score
    return out

"""
    python exp_grid.py <data dir>

Does the beat grid help the section model? Same folds, same stage-2 setup, with and without grid columns; decoded and scored the same way."""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import load, memory, STAGE1, STAGE2, FOLDS, groups_to_track
from decode import score, DEFAULT
from sklearn.ensemble import HistGradientBoostingClassifier
D = sys.argv[1]  # data directory: ft-clean/, grid-clean/ (grid-dump.mts), ssme-gt-clean.json
g = json.load(open(f'{D}/ssme-gt-clean.json'))
data = load([f'{D}/ft-clean'], g); X = data['X']; y = data['y']; st = data['starts']; ids = data['ids']
gn = json.load(open(f'{D}/grid-clean/names.json'))
G = []
for j, k in enumerate(ids):
    n = st[j + 1] - st[j]
    a = np.fromfile(f'{D}/grid-clean/{k}.grid', dtype='<f4').reshape(-1, len(gn))
    a = a[:n] if len(a) >= n else np.concatenate([a, np.zeros((n - len(a), len(gn)), np.float32)])
    G.append(a)
G = np.concatenate(G)
near = lambda w: ((G[:, gn.index('beatsToLine')] <= w) | (G[:, gn.index('beatsSinceLine')] <= w)).astype(np.float32)[:, None]
G2 = np.concatenate([G, near(1), near(2), near(4)], 1)
track = groups_to_track(data); fold = np.array([int(k) % FOLDS for k in ids])[track]
keep = ~data['ignore']
for label, XX in (('without grid', X), ('with grid', np.concatenate([X, G2], 1))):
    p1 = np.zeros((len(X), 3)); p2 = np.zeros(len(X))
    for f in range(FOLDS):
        tr, te = fold != f, fold == f
        p1[te] = HistGradientBoostingClassifier(**STAGE1, random_state=0).fit(XX[tr], y[tr]).predict_proba(XX[te])
    X2 = np.concatenate([XX, p1, memory(p1, st)], 1)
    for f in range(FOLDS):
        tr, te = (fold != f) & keep, fold == f
        p2[te] = HistGradientBoostingClassifier(**STAGE2, random_state=0).fit(X2[tr], data['drop'][tr]).predict_proba(X2[te])[:, 1]
    np.savez_compressed(f'{D}/exp-grid-{label.replace(" ", "-")}.npz', p1=p1, p2=p2, starts=st, ids=np.array(ids), conds=np.zeros(len(ids), int))
    r = score({'p1': p1, 'p2': p2, 'starts': st, 'ids': np.array(ids), 'conds': np.zeros(len(ids), int)}, g, DEFAULT)
    print(label, {k: round(r[k], 3) for k in ['drop_P', 'drop_R', 'drop_F1', 'build_F1', 'break_F1', 'anticipation', 'mean_F1']}, flush=True)
# How often do labelled drops land near the grid's 8-bar line, against all slots?
on = near(1)[:, 0] > 0
locked = G[:, 0] > 0
hits = []
for j, k in enumerate(ids):
    a = st[j]
    for d in g[k]['drop']:
        i = a + int(d / 0.25)
        if i < st[j + 1] and locked[i]: hits.append(on[max(a, i - 4): i + 4].any())
print(f'labelled drops within 1 beat of the grid 8-bar line (+-1 s): {np.mean(hits):.0%}; share of all locked time that is: {on[locked].mean():.0%}')

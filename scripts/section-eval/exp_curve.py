"""Learning curve: trains on 25, 50, 75 and 100% of each fold's training tracks and scores the held-out fold.

    python exp_curve.py <data dir>   (needs ft-clean/, m5/oof.npz, ssme-gt-clean.json)
"""
import json
import os
import sys

import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import load, memory, STAGE1, STAGE2, FOLDS, groups_to_track
from decode import score, DEFAULT
from sklearn.ensemble import HistGradientBoostingClassifier
D=sys.argv[1]
g=json.load(open(f'{D}/ssme-gt-clean.json'))
data=load([f'{D}/ft-clean'], g); X=data['X']; y=data['y']; st=data['starts']; ids=data['ids']
o=dict(np.load(f'{D}/m5/oof.npz')); p1_oof=o['p1'][:len(X)]
X2_oof=np.concatenate([X,p1_oof,memory(p1_oof,st)],1)
track=groups_to_track(data); tfold=np.array([int(k)%FOLDS for k in ids]); fold=tfold[track]
keep=~data['ignore']; rng=np.random.default_rng(0)
for frac in [0.25,0.5,0.75,1.0]:
    runs=[]
    for rep in range(2 if frac<1 else 1):
        p1=np.zeros((len(X),3)); p2=np.zeros(len(X))
        for f in range(FOLDS):
            pool=np.where(tfold!=f)[0]; chosen=rng.choice(pool,int(round(len(pool)*frac)),replace=False)
            tr=np.isin(track,chosen); te=fold==f
            m1=HistGradientBoostingClassifier(**STAGE1,random_state=0).fit(X[tr],y[tr]); p1[te]=m1.predict_proba(X[te])
            m2=HistGradientBoostingClassifier(**STAGE2,random_state=0).fit(X2_oof[tr&keep],data['drop'][tr&keep])
            # the held-out fold's stage 2 sees this run's own stage 1, as it would at run time
            X2te=np.concatenate([X[te],p1[te],memory(p1,st)[te]],1)
            p2[te]=m2.predict_proba(X2te)[:,1]
        r=score({'p1':p1,'p2':p2,'starts':st,'ids':np.array(ids),'conds':np.zeros(len(ids),int)},g,DEFAULT)
        runs.append(r)
    m=lambda k: np.mean([r[k] for r in runs])
    n=int(round(len(ids)*0.8*frac))
    print(f'{frac:.0%} of training tracks (~{n} songs): drop F1 {m("drop_F1"):.3f}  build F1 {m("build_F1"):.3f}  break F1 {m("break_F1"):.3f}  mean {m("mean_F1"):.3f}', flush=True)

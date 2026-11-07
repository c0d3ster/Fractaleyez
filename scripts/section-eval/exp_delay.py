"""Does waiting help? Trains the drop detector on "a drop landed D s ago", with the features at the drop moment next to the
current ones, and scores it out of fold. It did not beat the detector that answers at once (nor did a version without the
drop-moment features, which did worse still).

    python exp_delay.py <data dir>   (needs ft-clean/, m5/oof.npz from train.py on clean, room and laptop, ssme-gt-clean.json)
"""
import json
import os
import sys

import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import load, memory, STAGE2, FOLDS, groups_to_track
from score import match
from sklearn.ensemble import HistGradientBoostingClassifier
D=sys.argv[1]
g=json.load(open(f'{D}/ssme-gt-clean.json'))
data=load([f'{D}/ft-clean'], g); X=data['X']; st=data['starts']; ids=data['ids']
o=dict(np.load(f'{D}/m5/oof.npz')); p1=o['p1'][:len(X)]   # cond 0 (clean) comes first, same track order
assert list(o['ids'][:len(ids)])==ids
X2=np.concatenate([X,p1,memory(p1,st)],1)
track=groups_to_track(data); fold=np.array([int(k)%FOLDS for k in ids])[track]
t=np.concatenate([(np.arange(b-a)+1)*0.25 for a,b in zip(st[:-1],st[1:])])
def labels(delay):
    y=np.zeros(len(X),int); ign=np.zeros(len(X),bool)
    for j,k in enumerate(ids):
        a,b=st[j],st[j+1]; tt=t[a:b]
        for d in g[k]['drop']:
            c=d+delay
            ign[a:b]|=(tt>=d-2)&(tt<=c+3)
            y[a:b][(tt>=c-0.5)&(tt<=c+1.25)]=1
    return y, ign&(y==0)
def evaluate(p2, delay, th, refractory=6):
    tp=npred=ntrue=0; lat=[]
    for j,k in enumerate(ids):
        a,b=st[j],st[j+1]; drops=[]; last=-1e9; fired=[]
        for i,v in enumerate(p2[a:b]):
            now=(i+1)*0.25
            if v>=th and now-last>=refractory and now>=8+delay: drops.append(now-delay); fired.append(now); last=now
        h,l=match(drops,g[k]['drop']); tp+=h; npred+=len(drops); ntrue+=len(g[k]['drop'])
        for d in g[k]['drop']:
            near=[f for f,r in zip(fired,drops) if d-1<=r<=d+3]
            if near: lat.append(min(near)-d)
    P=tp/max(1,npred); R=tp/max(1,ntrue); return P,R,(2*P*R/(P+R) if P+R else 0),(float(np.median(lat)) if lat else None)
def lag(A, slots):
    out=np.empty_like(A)
    for a,b in zip(st[:-1],st[1:]): out[a:b]=A[a:b][np.maximum(0,np.arange(b-a)-slots)]
    return out
for delay in [1.0,1.5,2.0,3.0]:
    y,ign=labels(delay); p2=np.zeros(len(X))
    # what the drop moment looked like (the features and stage-1 memory at now - delay) next to what came after (now)
    XX=np.concatenate([X2, lag(X2, int(delay*4))],1)
    for f in range(FOLDS):
        tr=(fold!=f)&~ign; te=fold==f
        p2[te]=HistGradientBoostingClassifier(**STAGE2,random_state=0).fit(XX[tr],y[tr]).predict_proba(XX[te])[:,1]
    np.save(f'{D}/p2_delaylag{delay}.npy',p2)
    best=max((evaluate(p2,delay,th)+(th,) for th in [0.2,0.3,0.4,0.5,0.6,0.7]), key=lambda r:r[2])
    print(f'delay {delay}s with the drop-moment view: best P {best[0]:.2f} R {best[1]:.2f} F1 {best[2]:.3f} @ {best[4]}, wall-clock latency median {best[3]}', flush=True)

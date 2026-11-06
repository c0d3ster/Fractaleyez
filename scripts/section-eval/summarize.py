import json, sys, glob, os
def runs(slots):
    out=[]; cur=None
    for s in slots:
        if cur and cur[0]==s['section']: cur[2]=s['t']
        else:
            if cur: out.append(cur)
            cur=[s['section'], s['t']-0.25, s['t']]
    out.append(cur); return out
def fmt(t): return f"{int(t//60)}:{int(t%60):02d}"
tot={}
for f in sorted(glob.glob(sys.argv[1]+'/*.json')):
    if f.endswith('.frames.json'): continue
    d=json.load(open(f)); r=runs(d['slots'])
    keep=[x for x in r if x[2]-x[1]>=1.5 and x[0] not in ('groove',)]
    print(os.path.basename(f)[:-5], f"{d['seconds']:.0f}s songs={max(x['song'] for x in d['slots'])}:", ' '.join(f"{x[0][:5]}@{fmt(x[1])}({x[2]-x[1]:.0f}s)" for x in keep))
    for x in r: tot[x[0]]=tot.get(x[0],0)+x[2]-x[1]
print('total seconds by label:', {k:round(v) for k,v in sorted(tot.items())})

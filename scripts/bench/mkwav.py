import wave, struct, math, random, sys
sr=44100; bpm=128; dur=16.0
beat=60.0/bpm
n=int(sr*dur); buf=[0.0]*n
random.seed(1)
def add(start, samples):
    i=int(start*sr)
    for k,v in enumerate(samples):
        if i+k<n: buf[i+k]+=v
def kick():
    out=[]; L=int(0.25*sr); ph=0.0
    for k in range(L):
        t=k/sr; f=45+110*math.exp(-t*28); ph+=2*math.pi*f/sr
        out.append(0.9*math.sin(ph)*math.exp(-t*11))
    return out
def snare():
    out=[]; L=int(0.2*sr)
    for k in range(L):
        t=k/sr
        out.append(0.5*(random.uniform(-1,1)*math.exp(-t*22)+0.5*math.sin(2*math.pi*190*t)*math.exp(-t*30)))
    return out
def hat():
    out=[]; L=int(0.05*sr)
    for k in range(L):
        t=k/sr; out.append(0.15*random.uniform(-1,1)*math.exp(-t*70))
    return out
K,S,H=kick(),snare(),hat()
b=0
while b*beat<dur-0.3:
    add(b*beat,K)
    if b%2==1: add(b*beat,S)
    add(b*beat+beat/2,H)
    b+=1
m=max(abs(x) for x in buf) or 1
w=wave.open(sys.argv[1],'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x/m*0.95))*32767)) for x in buf)); w.close()

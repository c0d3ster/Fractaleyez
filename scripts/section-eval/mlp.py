"""A one-hidden-layer network (tanh, then one sigmoid per output) trained with weighted binary cross-entropy and L-BFGS, for drum-train.py
and riser-train.py. Shapes match what drum-hits.ts and riser.ts read: hidden.weights[out][in], output.weights[out][in]."""
import numpy as np
from scipy.optimize import minimize


def fit(X: np.ndarray, Y: np.ndarray, hidden: int, pos_weight: np.ndarray, l2: float = 1e-3, iters: int = 1500, seed: int = 0) -> dict:
    """X: rows x features. Y: rows x outputs of 0, 1, or -1 (left out). pos_weight: per output, how much a positive counts against a negative."""
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd
    n, d = Z.shape
    k = Y.shape[1]
    known = (Y >= 0).astype(float)
    Yc = np.clip(Y, 0, 1).astype(float)
    W = known * np.where(Yc == 1, pos_weight[None, :], 1.0)
    W /= W.sum(0, keepdims=True) / n + 1e-12
    shapes = [(d, hidden), (hidden,), (hidden, k), (k,)]
    sizes = [int(np.prod(s)) for s in shapes]

    def unpack(w):
        out, at = [], 0
        for s, z in zip(shapes, sizes):
            out.append(w[at:at + z].reshape(s))
            at += z
        return out

    def loss(w):
        W1, b1, W2, b2 = unpack(w)
        H = np.tanh(Z @ W1 + b1)
        S = H @ W2 + b2
        P = 1 / (1 + np.exp(-np.clip(S, -30, 30)))
        L = -np.sum(W * (Yc * np.log(P + 1e-9) + (1 - Yc) * np.log(1 - P + 1e-9))) / n + l2 * (np.sum(W1 ** 2) + np.sum(W2 ** 2))
        dS = W * (P - Yc) / n
        gW2 = H.T @ dS + 2 * l2 * W2
        dH = (dS @ W2.T) * (1 - H ** 2)
        gW1 = Z.T @ dH + 2 * l2 * W1
        return L, np.concatenate([gW1.ravel(), dH.sum(0), gW2.ravel(), dS.sum(0)])

    rng = np.random.default_rng(seed)
    w0 = np.concatenate([rng.normal(0, 1 / np.sqrt(d), d * hidden), np.zeros(hidden), rng.normal(0, 1 / np.sqrt(hidden), hidden * k), np.zeros(k)])
    W1, b1, W2, b2 = unpack(minimize(loss, w0, jac=True, method='L-BFGS-B', options={'maxiter': iters}).x)
    return {'mean': mu, 'scale': sd, 'W1': W1, 'b1': b1, 'W2': W2, 'b2': b2}


def predict(model: dict, X: np.ndarray) -> np.ndarray:
    Z = (X - model['mean']) / model['scale']
    S = np.tanh(Z @ model['W1'] + model['b1']) @ model['W2'] + model['b2']
    return 1 / (1 + np.exp(-np.clip(S, -30, 30)))


def to_json(model: dict) -> dict:
    r = lambda a: np.round(a, 6).tolist()  # noqa: E731
    return {'mean': r(model['mean']), 'scale': r(model['scale']), 'hidden': {'weights': r(model['W1'].T), 'bias': r(model['b1'])},
            'output': {'weights': r(model['W2'].T), 'bias': r(model['b2'])}}

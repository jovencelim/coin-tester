import numpy as np
import librosa

from scipy.signal import hilbert
from scipy.optimize import curve_fit

def detect_onset(y, threshold=0.02):
    idx = np.argmax(np.abs(y) > threshold)
    return int(idx)

def extract_segment(y, sr, onset, duration=0.5):

    end = onset + int(duration * sr)

    segment = y[onset:end]

    window = np.hanning(len(segment))

    return segment * window

def compute_fft(segment, sr):

    fft = np.fft.rfft(segment)

    freqs = np.fft.rfftfreq(
        len(segment),
        1 / sr
    )

    magnitudes = np.abs(fft)

    peak_idx = np.argmax(magnitudes)

    f0 = freqs[peak_idx]

    return {
        "freqs": freqs.tolist(),
        "magnitudes": magnitudes.tolist(),
        "f0": float(f0),
    }

def compute_envelope(segment):

    analytic = hilbert(segment)

    envelope = np.abs(analytic)

    return envelope

def decay_model(t, A, alpha):

    return A * np.exp(-alpha * t)

def fit_decay(envelope, sr):

    t = np.arange(len(envelope)) / sr

    envelope = np.maximum(envelope, 1e-10)

    params, covariance = curve_fit(
        decay_model,
        t,
        envelope,
        p0=[1, 10]
    )

    A, alpha = params

    fit = decay_model(t, A, alpha)

    return {
        "A": float(A),
        "alpha": float(alpha),
        "fit": fit.tolist(),
    }

def compute_q(f0, alpha):

    if alpha <= 0:
        return 0

    return float((np.pi * f0) / alpha)


# ---------------------------------------------
# CLASSIFIER
# ---------------------------------------------

def classify_coin(f0, alpha, Q):

    if 2600 <= f0 <= 3600 and 400 <= Q <= 900:

        return {
            "verdict": "GENUINE",
            "confidence": 92
        }

    elif 2200 <= f0 <= 2600:

        return {
            "verdict": "SUSPECT",
            "confidence": 67
        }

    else:

        return {
            "verdict": "COUNTERFEIT",
            "confidence": 84
        }

def analyze_coin(file_path):

    y, sr = librosa.load(
        file_path,
        sr=44100
    )

    onset = detect_onset(y)

    segment = extract_segment(
        y,
        sr,
        onset
    )

    fft_data = compute_fft(
        segment,
        sr
    )

    envelope = compute_envelope(segment)

    decay = fit_decay(
        envelope,
        sr
    )

    Q = compute_q(
        fft_data["f0"],
        decay["alpha"]
    )

    classification = classify_coin(
        fft_data["f0"],
        decay["alpha"],
        Q
    )

    return {

        "waveform": segment.tolist(),

        "onset": onset,

        "fft": fft_data,

        "decay": {
            "envelope": envelope.tolist(),
            "fit": decay["fit"],
            "alpha": decay["alpha"],
        },

        "f0": fft_data["f0"],

        "alpha": decay["alpha"],

        "Q": Q,

        "classification": classification
    }
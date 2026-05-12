import numpy as np
import librosa
from scipy.signal import find_peaks
from scipy.optimize import curve_fit

SAMPLE_RATE       = 44100
RING_DURATION_MIN = 0.20  
RING_DURATION_MAX = 2.50   
RING_END_THRESHOLD = 0.05
MIN_FREQ_HZ       = 200
MAX_FREQ_HZ       = 8000
ONSET_WIN         = 512
ONSET_HOP         = 256
ONSET_MULT        = 8
ENVELOPE_FRAME    = 256
SNR_WARN_DB       = 15.0 

SURFACE_CORRECTIONS = {
    "Tile":     {"alpha_scale": 1.00, "f0_scale": 1.00},  
    "Wood":     {"alpha_scale": 1.75, "f0_scale": 0.94},  
}

def detect_onset(y: np.ndarray, sr: int = SAMPLE_RATE):
    n_frames = (len(y) - ONSET_WIN) // ONSET_HOP

    rms = np.array([
        np.sqrt(np.mean(y[i * ONSET_HOP : i * ONSET_HOP + ONSET_WIN] ** 2))
        for i in range(n_frames)
    ])

    if len(rms) == 0:
        return 0, 0.0

    if len(rms) >= 20:
        window_means   = np.array([np.mean(rms[i : i + 20]) for i in range(len(rms) - 19)])
        quietest_start = int(np.argmin(window_means))
        noise_floor    = float(np.median(rms[quietest_start : quietest_start + 20]))
    else:
        noise_floor = float(np.median(rms))

    cutoff     = noise_floor * ONSET_MULT
    peak_frame = int(np.argmax(rms))

    onset_frame = 0
    for i in range(peak_frame, -1, -1):
        if rms[i] < cutoff:
            onset_frame = i + 1
            break

    return int(onset_frame * ONSET_HOP), noise_floor

def extract_segment(
    y: np.ndarray,
    sr: int,
    onset: int,
    noise_floor_rms: float,
) -> np.ndarray:

    max_samples = int(RING_DURATION_MAX * sr)
    min_samples = int(RING_DURATION_MIN * sr)

    end_candidate = min(onset + max_samples, len(y))
    candidate     = y[onset : end_candidate]

    n_frames = len(candidate) // ENVELOPE_FRAME
    if n_frames < 4:
        seg = y[onset : end_candidate]
        return seg * np.hanning(len(seg))

    rms_frames = np.array([
        np.sqrt(np.mean(candidate[i * ENVELOPE_FRAME : (i + 1) * ENVELOPE_FRAME] ** 2))
        for i in range(n_frames)
    ])

    peak_rms  = float(rms_frames.max())
    threshold = max(RING_END_THRESHOLD * peak_rms, 2.0 * noise_floor_rms)

    peak_frame = int(np.argmax(rms_frames))
    post_peak  = rms_frames[peak_frame:]
    below      = np.where(post_peak < threshold)[0]

    if len(below) > 0:
        end_frame  = peak_frame + int(below[0])
        end_sample = onset + end_frame * ENVELOPE_FRAME
    else:
        end_sample = onset + max_samples

    end_sample = max(end_sample, onset + min_samples)
    end_sample = min(end_sample, len(y))

    segment = y[onset : end_sample]
    return segment * np.hanning(len(segment))

def compute_fft(segment: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    N     = int(2 ** np.ceil(np.log2(len(segment))))
    fft   = np.fft.rfft(segment, n=N)
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)
    mags  = np.abs(fft) / N
    mags[1:-1] *= 2

    with np.errstate(divide="ignore"):
        mag_db = 20 * np.log10(np.maximum(mags, 1e-8))

    mask      = (freqs >= MIN_FREQ_HZ) & (freqs <= MAX_FREQ_HZ)
    band_mags = mag_db.copy()
    band_mags[~mask] = -80

    peaks, props = find_peaks(band_mags, prominence=6, distance=5)
    if len(peaks) == 0:
        f0_bin = int(np.argmax(band_mags))
    else:
        f0_bin = peaks[int(np.argmax(props["prominences"]))]

    f0 = float(freqs[f0_bin])

    harmonics = []
    for n in (2, 3):
        target = f0 * n
        lo, hi = target * 0.85, min(target * 1.15, MAX_FREQ_HZ)
        h_mask = (freqs >= lo) & (freqs <= hi)
        if h_mask.sum() == 0:
            continue
        h_mags          = mag_db.copy()
        h_mags[~h_mask] = -80
        h_peaks, h_props = find_peaks(h_mags, prominence=3, distance=3)
        if len(h_peaks) > 0:
            best = h_peaks[int(np.argmax(h_props["prominences"]))]
        else:
            best = int(np.argmax(h_mags))
        harmonics.append({
            "n":      n,
            "freq":   round(float(freqs[best]), 2),
            "mag_db": round(float(mag_db[best]), 2),
            "ratio":  round(float(freqs[best]) / f0, 4),
        })

    return {
        "freqs":         freqs.tolist(),
        "magnitudes_db": mag_db.tolist(),
        "f0":            round(f0, 2),
        "f0_bin":        int(f0_bin),
        "f0_mag_db":     round(float(mag_db[f0_bin]), 2),
        "harmonics":     harmonics,
    }

def compute_rms_envelope(segment: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    """Frame-by-frame RMS amplitude envelope."""
    n_frames = len(segment) // ENVELOPE_FRAME

    raw = np.array([
        np.sqrt(np.mean(segment[i * ENVELOPE_FRAME : (i + 1) * ENVELOPE_FRAME] ** 2))
        for i in range(n_frames)
    ])
    times = np.array([
        (i * ENVELOPE_FRAME + ENVELOPE_FRAME / 2) / sr
        for i in range(n_frames)
    ])

    max_val  = float(raw.max()) if raw.max() > 0 else 1.0
    envelope = raw / max_val

    return {
        "envelope": envelope.tolist(),
        "times":    times.tolist(),
        "raw":      raw.tolist(),
        "max_val":  max_val,
    }

def fit_decay(envelope: list, times: list) -> dict:
    env = np.array(envelope)
    t   = np.array(times)

    valid = env > 1e-6
    if valid.sum() < 4:
        return {
            "alpha": 0.0, "A": 1.0, "r_squared": 0.0,
            "alpha_ci": [0.0, 0.0], "fit": envelope,
        }

    t_v, env_v = t[valid], env[valid]

    def model(t, A, alpha):
        return A * np.exp(-alpha * t)

    try:
        popt, pcov = curve_fit(
            model, t_v, env_v,
            p0=[1.0, 20.0],
            bounds=([0, 0], [10, 500]),
            maxfev=5000,
        )
        A, alpha = popt

        perr     = np.sqrt(np.diag(pcov))
        alpha_ci = [
            float(max(0.0, alpha - 1.96 * perr[1])),
            float(alpha + 1.96 * perr[1]),
        ]

        residuals = env_v - model(t_v, *popt)
        ss_res    = np.sum(residuals ** 2)
        ss_tot    = np.sum((env_v - env_v.mean()) ** 2)
        r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        fit       = model(t, A, alpha).tolist()

    except (RuntimeError, ValueError):
        log_env   = np.log(np.maximum(env_v, 1e-10))
        coeffs    = np.polyfit(t_v, log_env, 1)
        alpha     = float(-coeffs[0])
        A         = float(np.exp(coeffs[1]))
        alpha_ci  = [0.0, 0.0]
        r_squared = 0.0
        fit       = (A * np.exp(-alpha * t)).tolist()

    return {
        "alpha":     float(max(0.0, alpha)),
        "A":         float(A),
        "r_squared": round(r_squared, 4),
        "alpha_ci":  alpha_ci,
        "fit":       fit,
    }

def compute_q(f0: float, alpha: float) -> float:
    if alpha < 0.1:
        return 0.0
    return round(float((np.pi * f0) / alpha), 2)

def compute_snr(env_raw: np.ndarray, noise_floor_rms: float) -> float:
    if noise_floor_rms <= 0 or len(env_raw) == 0:
        return 99.0
    peak = float(np.max(env_raw))
    return round(float(20.0 * np.log10(peak / noise_floor_rms)), 1) if peak > 0 else 0.0

DENOMINATION_PROFILES = {
    "1": {
        "label":       "₱1 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 23.0,
        "genuine": {
            "f0":             (1500, 5500),
            "alpha":          (0.5,  35),
            "harmonic_ratio": (1.70, 2.30),
        },
        "counterfeit": {
            "f0":             (200,  1600),
            "alpha":          (25,   120),
            "harmonic_ratio": (1.20, 1.70),
        },
    },
    "5": {
        "label":       "₱5 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 27.0,
        "genuine": {
            "f0":             (1000, 5000),
            "alpha":          (0.5,  30),
            "harmonic_ratio": (1.70, 2.30),
        },
        "counterfeit": {
            "f0":             (200,  1200),
            "alpha":          (20,   100),
            "harmonic_ratio": (1.20, 1.70),
        },
    },
    "10": {
        "label":       "₱10 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 25.5,
        "genuine": {
            "f0":             (1200, 5000),
            "alpha":          (0.5,  30),
            "harmonic_ratio": (1.70, 2.30),
        },
        "counterfeit": {
            "f0":             (200,  1300),
            "alpha":          (22,   110),
            "harmonic_ratio": (1.20, 1.70),
        },
    },
    "20": {
        "label":       "₱20 NGC",
        "material":    "Bimetallic (steel center + brass ring)",
        "diameter_mm": 28.0,
        "genuine": {
            "f0":             (800,  4500),
            "alpha":          (0.5,  40),
            "harmonic_ratio": (1.65, 2.35),
        },
        "counterfeit": {
            "f0":             (200,  1000),
            "alpha":          (30,   130),
            "harmonic_ratio": (1.15, 1.65),
        },
    },
}


def classify_coin(
    f0: float,
    alpha: float,
    Q: float,
    denomination: str = "1",
    surface: str = "Tile",
    harmonics: list = None,
    r_squared: float = 1.0,
) -> dict:
    profile = DENOMINATION_PROFILES.get(str(denomination))
    if profile is None:
        return {
            "verdict": "Unknown", "confidence": 0.0,
            "denomination": denomination, "coin_label": "Unknown denomination",
            "scores": {}, "error": f"Denomination '{denomination}' not supported.",
        }

    correction = SURFACE_CORRECTIONS.get(surface, SURFACE_CORRECTIONS["Tile"])
    f0_norm    = f0    / correction["f0_scale"]
    alpha_norm = alpha / correction["alpha_scale"]

    harmonic_ratio = None
    if harmonics:
        for h in harmonics:
            if h["n"] == 2:
                harmonic_ratio = h["ratio"]
                break

    use_alpha = r_squared >= 0.3

    def score_class(cls_ranges: dict) -> float:
        features = {"f0": f0_norm}
        if use_alpha:
            features["alpha"] = alpha_norm
        if harmonic_ratio is not None:
            features["harmonic_ratio"] = harmonic_ratio
        total = 0.0
        for feat, val in features.items():
            if feat not in cls_ranges:
                continue
            lo, hi = cls_ranges[feat]
            mid    = (lo + hi) / 2
            half   = (hi - lo) / 2
            dist   = abs(val - mid) / half if half > 0 else 0
            total += max(0.0, 1.0 - dist)
        n = len(features)
        return round(total / n * 100, 1) if n > 0 else 0.0

    genuine_score     = score_class(profile["genuine"])
    counterfeit_score = score_class(profile["counterfeit"])

    if genuine_score > counterfeit_score and genuine_score >= 15:
        verdict    = "Genuine"
        confidence = genuine_score
    elif genuine_score > counterfeit_score:
        verdict    = "Suspect"
        confidence = genuine_score
    else:
        verdict    = "Counterfeit"
        confidence = counterfeit_score

    return {
        "verdict":      verdict,
        "confidence":   confidence,
        "denomination": denomination,
        "coin_label":   profile["label"],
        "material":     profile["material"],
        "f0_norm":      round(f0_norm, 2),
        "alpha_norm":   round(alpha_norm, 4),
        "scores": {
            "genuine_score":     genuine_score,
            "counterfeit_score": counterfeit_score,
        },
    }

def analyze_coin(file_path: str, meta: dict = None) -> dict:
    if meta is None:
        meta = {}

    denomination = str(meta.get("denomination", "1"))
    surface      = str(meta.get("surface", "Tile"))

    y, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)

    onset, noise_floor = detect_onset(y, sr)
    segment            = extract_segment(y, sr, onset, noise_floor)

    fft_data  = compute_fft(segment, sr)
    f0        = fft_data["f0"]
    harmonics = fft_data["harmonics"]

    env_data = compute_rms_envelope(segment, sr)
    decay    = fit_decay(env_data["envelope"], env_data["times"])
    alpha    = decay["alpha"]

    Q      = compute_q(f0, alpha)
    snr_db = compute_snr(np.array(env_data["raw"]), noise_floor)
    clf    = classify_coin(f0, alpha, Q, denomination, surface, harmonics, decay["r_squared"])

    return {
        "f0":         f0,
        "alpha":      round(alpha, 4),
        "Q":          round(Q, 2),
        "onset":      onset,
        "onset_time": round(onset / sr, 4),

        "r_squared": decay["r_squared"],
        "alpha_ci":  decay["alpha_ci"],

        "snr_db":       snr_db,
        "snr_warning":  snr_db < SNR_WARN_DB,
        "alpha_warning": alpha < 1.0,

        "f0_norm":    clf.get("f0_norm"),
        "alpha_norm": clf.get("alpha_norm"),

        "harmonics": harmonics,

        "waveform": {
            "samples":     y.tolist(),
            "sample_rate": sr,
            "onset_index": onset,
        },
        "fft": {
            "freqs":         fft_data["freqs"],
            "magnitudes_db": fft_data["magnitudes_db"],
            "f0":            f0,
            "f0_bin":        fft_data["f0_bin"],
            "harmonics":     harmonics,
        },
        "decay": {
            "times":    env_data["times"],
            "envelope": env_data["envelope"],
            "fit":      decay["fit"],
            "alpha":    alpha,
            "A":        decay["A"],
        },

        "verdict":      clf["verdict"],
        "confidence":   clf["confidence"],
        "denomination": clf["denomination"],
        "coin_label":   clf["coin_label"],
        "scores":       clf["scores"],

        "meta": meta,
    }

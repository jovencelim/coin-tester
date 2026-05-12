"""
signal.py
---------
DSP pipeline for the NGC Philippine peso coin authenticity tester.

Experimental standards:
  - Surface     : Tile (baseline), Concrete, Wood
  - Drop height : 30 cm (fixed, guided)
  - Recording   : 44,100 Hz, mono WAV (file upload)

Pipeline:
  1. detect_onset         — quietest-window noise floor, returns noise_floor_rms
  2. extract_segment      — dynamic ring window (noise-adaptive, max 2.5 s)
  3. compute_fft          — padded FFT, dB scale, f0 + harmonic extraction
  4. compute_rms_envelope — frame RMS for decay fitting
  5. fit_decay            — bounded curve_fit, R², 95% CI on alpha
  6. compute_q            — display metric only (not used in classifier)
  7. compute_snr          — warns when recording quality is too poor to trust
  8. classify_coin        — surface-normalized f0 + alpha + harmonic_ratio
  9. analyze_coin         — full pipeline, returns JSON-ready dict
"""

import numpy as np
import librosa
from scipy.signal import find_peaks
from scipy.optimize import curve_fit


# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

SAMPLE_RATE       = 44100
RING_DURATION_MIN = 0.20    # minimum ring window in seconds
RING_DURATION_MAX = 2.50    # maximum ring window in seconds
RING_END_THRESHOLD = 0.05   # end ring when envelope < this fraction of peak
MIN_FREQ_HZ       = 200
MAX_FREQ_HZ       = 8000
ONSET_WIN         = 512
ONSET_HOP         = 256
ONSET_MULT        = 8
ENVELOPE_FRAME    = 256
SNR_WARN_DB       = 15.0    # flag recording if SNR below this level (dB)


# ─────────────────────────────────────────────
# SURFACE CORRECTIONS
# ─────────────────────────────────────────────
# Scale factors normalize measured f0 and alpha to a Tile baseline
# before comparing against DENOMINATION_PROFILES:
#   f0_norm    = f0_measured    / f0_scale
#   alpha_norm = alpha_measured / alpha_scale
#
# Why: the same genuine coin dropped on Wood decays faster (higher alpha)
# and resonates at a slightly lower f0 than on Tile. Without correction,
# every surface would need its own set of profile ranges.
#
# ⚠️  IMPORTANT: These are estimated starting values.
#     Record 20+ genuine drops per surface, compute means, then update:
#     alpha_scale = mean_alpha_surface / mean_alpha_tile  (same for f0).

SURFACE_CORRECTIONS = {
    "Tile":     {"alpha_scale": 1.00, "f0_scale": 1.00},   # baseline
    "Concrete": {"alpha_scale": 1.10, "f0_scale": 0.98},   # slightly faster decay
    "Wood":     {"alpha_scale": 1.75, "f0_scale": 0.94},   # significantly faster decay
    "Glass":    {"alpha_scale": 0.90, "f0_scale": 1.02},   # legacy surface
}


# ─────────────────────────────────────────────
# 1. ONSET DETECTION
# ─────────────────────────────────────────────

def detect_onset(y: np.ndarray, sr: int = SAMPLE_RATE):
    """
    Adaptive RMS onset detector.

    Returns (onset_sample, noise_floor_rms).

    Uses the quietest 20 consecutive frames anywhere in the recording
    as the noise floor — not always the first 20 frames. This handles
    uploaded files that start mid-handling noise or with very little
    pre-drop silence, which broke the original fixed-window approach.
    """
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

    cutoff = noise_floor * ONSET_MULT
    above  = np.where(rms > cutoff)[0]
    onset  = int(above[0] * ONSET_HOP) if len(above) > 0 else 0

    return onset, noise_floor


# ─────────────────────────────────────────────
# 2. RING SEGMENT EXTRACTION  (dynamic window)
# ─────────────────────────────────────────────

def extract_segment(
    y: np.ndarray,
    sr: int,
    onset: int,
    noise_floor_rms: float,
) -> np.ndarray:
    """
    Dynamic ring window with Hanning taper.

    Extends until the RMS envelope drops to
        max(RING_END_THRESHOLD × peak_rms, 2 × noise_floor_rms)
    capped at RING_DURATION_MAX seconds.

    On hard surfaces (tile, concrete) genuine coins ring for 1–2+ seconds.
    The previous fixed 500 ms cut off most of the decay tail, producing
    unreliable alpha estimates on those surfaces. On wood the threshold is
    reached quickly so the window self-terminates early.
    """
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


# ─────────────────────────────────────────────
# 3. FFT  (+ harmonic extraction)
# ─────────────────────────────────────────────

def compute_fft(segment: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    """
    Hanning-windowed FFT with f0 and harmonic extraction.

    After finding f0, searches ±15 % bands around 2×f0 and 3×f0 for
    secondary peaks. Harmonic ratios close to 2.0 / 3.0 indicate a
    uniform alloy; significant deviations suggest irregular casting.
    """
    N     = int(2 ** np.ceil(np.log2(len(segment))))
    fft   = np.fft.rfft(segment, n=N)
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)
    mags  = np.abs(fft) / N
    mags[1:-1] *= 2

    with np.errstate(divide="ignore"):
        mag_db = 20 * np.log10(np.maximum(mags, 1e-8))

    # f0: most prominent peak in [MIN_FREQ_HZ, MAX_FREQ_HZ]
    mask      = (freqs >= MIN_FREQ_HZ) & (freqs <= MAX_FREQ_HZ)
    band_mags = mag_db.copy()
    band_mags[~mask] = -80

    peaks, props = find_peaks(band_mags, prominence=6, distance=5)
    if len(peaks) == 0:
        f0_bin = int(np.argmax(band_mags))
    else:
        f0_bin = peaks[int(np.argmax(props["prominences"]))]

    f0 = float(freqs[f0_bin])

    # Harmonic extraction: 2nd and 3rd
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


# ─────────────────────────────────────────────
# 4. RMS ENVELOPE
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# 5. DECAY FIT
# ─────────────────────────────────────────────

def fit_decay(envelope: list, times: list) -> dict:
    """Fit A·e^(−α·t) with bounds, R², and 95% CI on alpha."""
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


# ─────────────────────────────────────────────
# 6. Q-FACTOR  (display metric only)
# ─────────────────────────────────────────────

def compute_q(f0: float, alpha: float) -> float:
    """Q = π · f₀ / α. Not used in classification (derived from f0+alpha)."""
    return float((np.pi * f0) / alpha) if alpha > 0 else 0.0


# ─────────────────────────────────────────────
# 7. SNR
# ─────────────────────────────────────────────

def compute_snr(env_raw: np.ndarray, noise_floor_rms: float) -> float:
    """20·log10(peak_envelope / noise_floor). Low SNR → unreliable verdict."""
    if noise_floor_rms <= 0 or len(env_raw) == 0:
        return 99.0
    peak = float(np.max(env_raw))
    return round(float(20.0 * np.log10(peak / noise_floor_rms)), 1) if peak > 0 else 0.0


# ─────────────────────────────────────────────
# 8. CLASSIFIER
# ─────────────────────────────────────────────

# Acoustic profiles are calibrated for Tile surface at 30 cm drop.
# SURFACE_CORRECTIONS normalizes measurements to this baseline before scoring.
#
# Features used: f0, alpha, harmonic_ratio (2nd harmonic / f0).
# Q is NOT a classifier feature — it is deterministically derived from f0
# and alpha (Q = π·f0/α), so including it double-counts information.
#
# ⚠️  IMPORTANT: Record 20+ genuine + 10+ counterfeit drops per denomination
#     on Tile at 30 cm, then update each range to mean ± 1.5 × std.

DENOMINATION_PROFILES = {
    "1": {
        "label":       "₱1 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 23.0,
        "genuine": {
            "f0":             (2800, 3800),
            "alpha":          (8,    22),
            "harmonic_ratio": (1.92, 2.08),
        },
        "counterfeit": {
            "f0":             (1000, 2900),
            "alpha":          (25,   120),
            "harmonic_ratio": (1.65, 2.35),
        },
    },
    "5": {
        "label":       "₱5 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 27.0,
        "genuine": {
            "f0":             (2000, 3000),
            "alpha":          (6,    18),
            "harmonic_ratio": (1.92, 2.08),
        },
        "counterfeit": {
            "f0":             (800,  2100),
            "alpha":          (20,   100),
            "harmonic_ratio": (1.65, 2.35),
        },
    },
    "10": {
        "label":       "₱10 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 25.5,
        "genuine": {
            "f0":             (2300, 3300),
            "alpha":          (7,    20),
            "harmonic_ratio": (1.92, 2.08),
        },
        "counterfeit": {
            "f0":             (900,  2400),
            "alpha":          (22,   110),
            "harmonic_ratio": (1.65, 2.35),
        },
    },
    "20": {
        "label":       "₱20 NGC",
        "material":    "Bimetallic (steel center + brass ring)",
        "diameter_mm": 28.0,
        "genuine": {
            "f0":             (1400, 2400),
            "alpha":          (12,   32),
            "harmonic_ratio": (1.88, 2.12),
        },
        "counterfeit": {
            "f0":             (600,  1600),
            "alpha":          (30,   130),
            "harmonic_ratio": (1.60, 2.40),
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
) -> dict:
    """
    Denomination- and surface-aware authenticator.

    Normalizes measured f0 and alpha to the Tile baseline via
    SURFACE_CORRECTIONS before scoring against DENOMINATION_PROFILES.
    """
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

    def score_class(cls_ranges: dict) -> float:
        features = {"f0": f0_norm, "alpha": alpha_norm}
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

    if genuine_score > counterfeit_score and genuine_score >= 40:
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


# ─────────────────────────────────────────────
# 9. FULL PIPELINE
# ─────────────────────────────────────────────

def analyze_coin(file_path: str, meta: dict = None) -> dict:
    """
    Load a WAV file and run the complete analysis pipeline.
    Returns a single JSON-serializable dict for the Flask endpoint.
    """
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
    clf    = classify_coin(f0, alpha, Q, denomination, surface, harmonics)

    return {
        # ── Scalar features ──
        "f0":         f0,
        "alpha":      round(alpha, 4),
        "Q":          round(Q, 2),
        "onset":      onset,
        "onset_time": round(onset / sr, 4),

        # ── Fit quality ──
        "r_squared": decay["r_squared"],
        "alpha_ci":  decay["alpha_ci"],

        # ── Recording quality ──
        "snr_db":      snr_db,
        "snr_warning": snr_db < SNR_WARN_DB,

        # ── Surface-normalized features (used by classifier) ──
        "f0_norm":    clf.get("f0_norm"),
        "alpha_norm": clf.get("alpha_norm"),

        # ── Harmonics ──
        "harmonics": harmonics,

        # ── Chart data for React ──
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

        # ── Classification ──
        "verdict":      clf["verdict"],
        "confidence":   clf["confidence"],
        "denomination": clf["denomination"],
        "coin_label":   clf["coin_label"],
        "scores":       clf["scores"],

        # ── Experiment metadata ──
        "meta": meta,
    }

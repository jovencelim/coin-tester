"""
signal.py
---------
DSP pipeline for the ₱1 NGC coin authenticity tester.

Experimental standards:
  - Coin        : ₱1 New Generation Currency (NGC)
  - Surface     : Glass or ceramic tile
  - Drop height : 30 cm (fixed, guided)
  - Recording   : 44,100 Hz, mono WAV, mic 10 cm from drop point

Pipeline:
  1. detect_onset         — adaptive RMS threshold (no fixed 0.02)
  2. extract_segment      — 500 ms ring window + Hanning
  3. compute_fft          — padded FFT, dB scale, band-restricted f₀
  4. compute_rms_envelope — smoother than Hilbert for decay fitting
  5. fit_decay            — curve_fit with bounds + R² + 95% CI on α
  6. compute_q            — Q = π·f₀ / α
  7. classify_coin        — all 3 features used, confidence from distances
  8. analyze_coin         — full pipeline, returns JSON-ready dict
"""

import numpy as np
import librosa
from scipy.signal import find_peaks
from scipy.optimize import curve_fit


# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

SAMPLE_RATE     = 44100
RING_DURATION   = 0.50   # seconds to analyse after onset
MIN_FREQ_HZ     = 200    # ignore below — DC + surface rumble
MAX_FREQ_HZ     = 8000   # ignore above — not relevant for coin ring
ONSET_WIN       = 512    # samples per RMS onset window
ONSET_HOP       = 256    # hop between onset windows
ONSET_MULT      = 8      # onset = noise_floor × this multiplier
ENVELOPE_FRAME  = 256    # samples per RMS envelope frame


# ─────────────────────────────────────────────
# 1. ONSET DETECTION  (was: fixed threshold 0.02)
# ─────────────────────────────────────────────

def detect_onset(y: np.ndarray, sr: int = SAMPLE_RATE) -> int:
    """
    Adaptive RMS onset detector.

    Computes short-time RMS energy in overlapping windows.
    Noise floor = median of the first 20 frames (pre-drop silence).
    Onset = first frame exceeding noise_floor × ONSET_MULT.

    Much more robust than a fixed threshold across different
    recording volumes, mic distances, and room acoustics.

    Returns sample index of onset (0 if none found).
    """
    n_frames = (len(y) - ONSET_WIN) // ONSET_HOP

    rms = np.array([
        np.sqrt(np.mean(y[i * ONSET_HOP : i * ONSET_HOP + ONSET_WIN] ** 2))
        for i in range(n_frames)
    ])

    if len(rms) == 0:
        return 0

    # First 20 frames ≈ first 120 ms — should be silence before drop
    noise_floor = np.median(rms[:20])
    cutoff      = noise_floor * ONSET_MULT

    above = np.where(rms > cutoff)[0]
    return int(above[0] * ONSET_HOP) if len(above) > 0 else 0


# ─────────────────────────────────────────────
# 2. RING SEGMENT EXTRACTION
# ─────────────────────────────────────────────

def extract_segment(y: np.ndarray, sr: int, onset: int) -> np.ndarray:
    """
    Slice RING_DURATION seconds after onset and apply Hanning window
    to reduce spectral leakage in the FFT.
    """
    end     = min(onset + int(RING_DURATION * sr), len(y))
    segment = y[onset:end]
    window  = np.hanning(len(segment))
    return segment * window


# ─────────────────────────────────────────────
# 3. FFT  (was: no band restriction, no padding, linear magnitude)
# ─────────────────────────────────────────────

def compute_fft(segment: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    """
    Hanning-windowed FFT with three key improvements over the original:

    FIX 1 — Pad to next power of 2
        Ensures consistent bin resolution (Hz/bin = sr/N) across all
        recordings regardless of segment length variation.

    FIX 2 — Restrict f₀ search to [MIN_FREQ_HZ, MAX_FREQ_HZ]
        Prevents DC offset or low-frequency surface rumble from being
        selected as f₀ via a naive argmax on the full spectrum.

    FIX 3 — Convert to dB scale
        Linear magnitudes compress small harmonic peaks into invisibility.
        dB scale makes the FFT chart meaningful and matches standard
        signals & systems convention.

    Returns:
        freqs        : list[float]  — Hz axis
        magnitudes_db: list[float]  — magnitude in dB (floor −80 dB)
        f0           : float        — dominant ring frequency
        f0_bin       : int          — bin index of f₀
        f0_mag_db    : float        — magnitude at f₀
    """
    # FIX 1 — consistent frequency resolution via power-of-2 padding
    N       = int(2 ** np.ceil(np.log2(len(segment))))
    fft     = np.fft.rfft(segment, n=N)
    freqs   = np.fft.rfftfreq(N, d=1.0 / sr)
    mags    = np.abs(fft) / N
    mags[1:-1] *= 2  # one-sided correction

    # FIX 3 — dB scale
    with np.errstate(divide="ignore"):
        mag_db = 20 * np.log10(np.maximum(mags, 1e-8))

    # FIX 2 — band-restricted f₀ using scipy peak detection
    mask       = (freqs >= MIN_FREQ_HZ) & (freqs <= MAX_FREQ_HZ)
    band_mags  = mag_db.copy()
    band_mags[~mask] = -80  # suppress out-of-band bins

    # Use find_peaks with prominence filter to avoid selecting noise spikes
    peaks, props = find_peaks(band_mags, prominence=6, distance=5)
    if len(peaks) == 0:
        # Fallback: simple argmax within band
        f0_bin = int(np.argmax(band_mags))
    else:
        # Most prominent peak = dominant ring frequency
        f0_bin = peaks[int(np.argmax(props["prominences"]))]

    f0 = float(freqs[f0_bin])

    return {
        "freqs":        freqs.tolist(),
        "magnitudes_db": mag_db.tolist(),
        "f0":           round(f0, 2),
        "f0_bin":       int(f0_bin),
        "f0_mag_db":    round(float(mag_db[f0_bin]), 2),
    }


# ─────────────────────────────────────────────
# 4. RMS ENVELOPE  (was: Hilbert envelope)
# ─────────────────────────────────────────────

def compute_rms_envelope(segment: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    """
    Frame-by-frame RMS amplitude envelope.

    WHY NOT HILBERT:
        The Hilbert envelope is sample-by-sample — it tracks every
        oscillation within the ring waveform, producing a noisy curve
        that makes curve_fit converge poorly and gives unstable α.
        RMS in 256-sample frames (~5.8 ms) smooths out oscillations
        while still capturing the exponential decay shape accurately.

    Returns:
        envelope : list[float]  — normalized 0–1
        times    : list[float]  — time axis in seconds
        raw      : list[float]  — un-normalized RMS (for SNR calc)
    """
    n_frames = len(segment) // ENVELOPE_FRAME

    raw = np.array([
        np.sqrt(np.mean(segment[i * ENVELOPE_FRAME : (i+1) * ENVELOPE_FRAME] ** 2))
        for i in range(n_frames)
    ])
    times = np.array([
        (i * ENVELOPE_FRAME + ENVELOPE_FRAME / 2) / sr
        for i in range(n_frames)
    ])

    max_val  = raw.max() if raw.max() > 0 else 1.0
    envelope = raw / max_val

    return {
        "envelope": envelope.tolist(),
        "times":    times.tolist(),
        "raw":      raw.tolist(),
        "max_val":  float(max_val),
    }


# ─────────────────────────────────────────────
# 5. DECAY FIT  (was: no bounds, no R², no CI)
# ─────────────────────────────────────────────

def fit_decay(envelope: list, times: list) -> dict:
    """
    Fit A·e^(−α·t) using scipy.optimize.curve_fit.

    FIX 1 — bounds=[([0,0],[10,500])]
        Prevents α from converging to negative values (growing signal)
        or absurdly large values (instantaneous decay). Both were
        possible with the original unbounded curve_fit call.

    FIX 2 — R² (coefficient of determination)
        Quantifies how well the exponential model fits the actual
        envelope. R² < 0.85 suggests a noisy recording or double-impact.
        Critical for the rubric's "quantitative discussion" requirement.

    FIX 3 — 95% confidence interval on α
        perr from pcov gives the standard error on each parameter.
        α ± 1.96σ is the 95% CI — a narrow CI means a reliable fit,
        a wide CI means the recording was too noisy to trust.

    Returns:
        alpha     : float         — decay constant s⁻¹
        A         : float         — initial amplitude
        r_squared : float         — goodness of fit 0–1
        alpha_ci  : [float, float] — 95% confidence interval on α
        fit       : list[float]   — fitted curve (normalized)
    """
    env = np.array(envelope)
    t   = np.array(times)

    # Only fit where envelope is meaningfully above zero
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
        # FIX 1 — bounded fit with sensible initial guess
        popt, pcov = curve_fit(
            model, t_v, env_v,
            p0=[1.0, 20.0],
            bounds=([0, 0], [10, 500]),
            maxfev=5000,
        )
        A, alpha = popt

        # FIX 3 — 95% CI on α
        perr     = np.sqrt(np.diag(pcov))
        alpha_ci = [
            float(max(0.0, alpha - 1.96 * perr[1])),
            float(alpha + 1.96 * perr[1]),
        ]

        # FIX 2 — R²
        residuals = env_v - model(t_v, *popt)
        ss_res    = np.sum(residuals ** 2)
        ss_tot    = np.sum((env_v - env_v.mean()) ** 2)
        r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

        fit = model(t, A, alpha).tolist()

    except (RuntimeError, ValueError):
        # Fallback: log-linear regression if curve_fit fails to converge
        log_env  = np.log(np.maximum(env_v, 1e-10))
        coeffs   = np.polyfit(t_v, log_env, 1)
        alpha    = float(-coeffs[0])
        A        = float(np.exp(coeffs[1]))
        alpha_ci = [0.0, 0.0]
        r_squared = 0.0
        fit      = (A * np.exp(-alpha * t)).tolist()

    return {
        "alpha":     float(max(0.0, alpha)),
        "A":         float(A),
        "r_squared": round(r_squared, 4),
        "alpha_ci":  alpha_ci,
        "fit":       fit,
    }


# ─────────────────────────────────────────────
# 6. Q-FACTOR
# ─────────────────────────────────────────────

def compute_q(f0: float, alpha: float) -> float:
    """
    Q = π · f₀ / α
    Higher Q = slower ring decay = denser / more uniform alloy.
    ₱1 NGC genuine coins typically Q ≈ 400–800 on glass at 30 cm.
    """
    return float((np.pi * f0) / alpha) if alpha > 0 else 0.0


# ─────────────────────────────────────────────
# 7. CLASSIFIER
# ─────────────────────────────────────────────

# Per-denomination acoustic profiles for genuine NGC Philippine peso coins.
# Each denomination has its own f₀, α, and Q signature because they differ
# in diameter, thickness, and alloy composition.
#
# Structure per denomination:
#   genuine     — expected feature ranges for a real NGC coin
#   counterfeit — typical ranges for fake/token of similar size
#
# ⚠️  IMPORTANT: These are estimated starting ranges.
#     Record 20+ genuine drops PER DENOMINATION on glass at 30 cm,
#     then update each range to: mean ± 1.5 × std from your data.
#     The classifier accuracy depends entirely on your training data.

DENOMINATION_PROFILES = {
    "1": {
        "label":       "₱1 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 23.0,
        # Smallest of the four — highest resonant frequency
        "genuine": {
            "f0":    (2800, 3800),
            "alpha": (8,    22),
            "Q":     (400,  850),
        },
        "counterfeit": {
            "f0":    (1000, 2900),
            "alpha": (25,   120),
            "Q":     (30,   320),
        },
    },
    "5": {
        "label":       "₱5 NGC",
        "material":    "Nickel-plated steel",
        "diameter_mm": 27.0,
        # Larger than ₱1 → lower f₀, slower decay
        "genuine": {
            "f0":    (2000, 3000),
            "alpha": (6,    18),
            "Q":     (380,  780),
        },
        "counterfeit": {
            "f0":    (800,  2100),
            "alpha": (20,   100),
            "Q":     (25,   280),
        },
    },
    "10": {
        "label":       "₱10 NGC",
        "material":    "Nickel-plated steel",  # NGC series is NOT bimetallic
        "diameter_mm": 25.5,
        # Between ₱5 and ₱1 in diameter — f₀ sits between them
        # Thicker than ₱5 which partially offsets the smaller diameter effect
        "genuine": {
            "f0":    (2300, 3300),
            "alpha": (7,    20),
            "Q":     (390,  800),
        },
        "counterfeit": {
            "f0":    (900,  2400),
            "alpha": (22,   110),
            "Q":     (28,   290),
        },
    },
    "20": {
        "label":       "₱20 NGC",
        "material":    "Bimetallic (steel center + brass ring)",
        "diameter_mm": 28.0,
        # Largest coin → lowest f₀ among the four.
        # Bimetallic structure causes faster energy transfer between layers
        # → higher alpha (faster decay) and lower Q than a same-size steel coin.
        # This makes ₱20 acoustically distinct and easier to separate.
        "genuine": {
            "f0":    (1400, 2400),
            "alpha": (12,   32),
            "Q":     (200,  520),
        },
        "counterfeit": {
            "f0":    (600,  1600),
            "alpha": (30,   130),
            "Q":     (20,   180),
        },
    },
}


def classify_coin(f0: float, alpha: float, Q: float, denomination: str = "1") -> dict:
    """
    Denomination-aware authenticator.

    The user selects the denomination before dropping the coin.
    The classifier then answers one question:
        "Does this coin's [f₀, α, Q] match a genuine [denomination] NGC coin?"

    Outputs:
        verdict     : "Genuine" | "Suspect" | "Counterfeit"
        confidence  : float 0–100 (distance-based, not hardcoded)
        denomination: str  — which profile was used
        scores      : { "genuine_score": float, "counterfeit_score": float }

    Verdict logic:
        genuine_score > counterfeit_score AND genuine_score >= 40  → Genuine
        genuine_score > counterfeit_score AND genuine_score <  40  → Suspect
        counterfeit_score >= genuine_score                         → Counterfeit
    """
    profile = DENOMINATION_PROFILES.get(str(denomination))

    if profile is None:
        return {
            "verdict":      "Unknown",
            "confidence":   0.0,
            "denomination": denomination,
            "coin_label":   "Unknown denomination",
            "scores":       {},
            "error":        f"Denomination '{denomination}' not supported. Use: 1, 5, 10, 20",
        }

    def score_class(cls_ranges: dict) -> float:
        """Soft distance score: 1.0 at centroid, 0.0 at boundary edge."""
        features = {"f0": f0, "alpha": alpha, "Q": Q}
        total = 0.0
        for feat, val in features.items():
            lo, hi   = cls_ranges[feat]
            mid      = (lo + hi) / 2
            half     = (hi - lo) / 2
            dist     = abs(val - mid) / half if half > 0 else 0
            total   += max(0.0, 1.0 - dist)
        return round(total / 3 * 100, 1)

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
        "scores": {
            "genuine_score":     genuine_score,
            "counterfeit_score": counterfeit_score,
        },
    }


# ─────────────────────────────────────────────
# 8. FULL PIPELINE
# ─────────────────────────────────────────────

def analyze_coin(file_path: str, meta: dict = None) -> dict:
    """
    Load a WAV file and run the complete analysis pipeline.
    Returns a single JSON-serializable dict for the Flask endpoint.

    meta: dict with {
        drop_height  : int    — cm (default 30)
        surface      : str    — e.g. "Glass"
        denomination : str    — "1" | "5" | "10" | "20"  (required for classifier)
    }
    """
    if meta is None:
        meta = {}

    denomination = str(meta.get("denomination", "1"))

    # Load as mono float32 at fixed sample rate
    y, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)

    onset   = detect_onset(y, sr)
    segment = extract_segment(y, sr, onset)

    fft_data = compute_fft(segment, sr)
    f0       = fft_data["f0"]

    env_data = compute_rms_envelope(segment, sr)
    decay    = fit_decay(env_data["envelope"], env_data["times"])
    alpha    = decay["alpha"]

    Q        = compute_q(f0, alpha)
    clf      = classify_coin(f0, alpha, Q, denomination)

    return {
        # ── Scalar features ──
        "f0":          f0,
        "alpha":       round(alpha, 4),
        "Q":           round(Q, 2),
        "onset":       onset,
        "onset_time":  round(onset / sr, 4),

        # ── Fit quality ──
        "r_squared":   decay["r_squared"],
        "alpha_ci":    decay["alpha_ci"],

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
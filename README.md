# NGC Coin Authenticity Tester

Acoustic impulse analysis tool for authenticating Philippine New Generation Currency (NGC) coins. Drop a coin on a surface, upload the `.wav` recording, and the system classifies it as **Genuine**, **Suspect**, or **Counterfeit** using frequency and decay analysis.

---

## How It Works

When a coin is dropped on a hard surface it produces a short ring. The ring's acoustic signature — dominant frequency, decay rate, and harmonic structure — is determined by the coin's alloy, geometry, and mass. Genuine NGC coins made of nickel-plated steel have consistent, predictable signatures. Counterfeits made from cheaper alloys or irregular casting do not.

The pipeline:

```
WAV file upload
    │
    ▼
Onset detection      ← finds the exact moment of impact
    │
    ▼
Ring segment         ← dynamic window (ends when signal hits noise floor)
    │
    ├──► FFT          ← dominant frequency f₀ + harmonics (2f₀, 3f₀)
    │
    ├──► Decay fit    ← fits A·e^(−αt), extracts decay constant α and R²
    │
    ├──► Q-factor     ← Q = π·f₀/α  (display only)
    │
    ├──► SNR check    ← warns if recording quality is too poor to trust
    │
    └──► Classifier   ← surface-normalized [f₀, α, harmonic ratio] → verdict
```

---

## Supported Coins

| Denomination | Material | Diameter |
|---|---|---|
| ₱1 NGC | Nickel-plated steel | 23.0 mm |
| ₱5 NGC | Nickel-plated steel | 27.0 mm |
| ₱10 NGC | Nickel-plated steel | 25.5 mm |
| ₱20 NGC | Bimetallic (steel + brass ring) | 28.0 mm |

## Supported Surfaces

Tile (baseline), Wood.

The system applies surface correction factors to normalize measured f₀ and α to the Tile baseline before classification, so a single set of coin profiles works across both surfaces.

---

## Project Structure

```
coin-tester/
├── backend/
│   ├── app.py                  # Flask API (GET /, POST /analyze)
│   ├── requirements.txt
│   └── services/
│       └── signal.py           # Full DSP pipeline
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx             # Root — orchestrates upload → API → display
        ├── main.jsx
        ├── index.css
        ├── services/
        │   └── api.js          # (unused — App.jsx calls fetch directly)
        └── components/
            ├── Uploader.jsx    # File drop zone + denomination + surface selector
            ├── Waveform.jsx    # Raw waveform with onset marker
            ├── FFTChart.jsx    # Frequency spectrum with f₀ and harmonic markers
            ├── DecayChart.jsx  # Envelope + exponential fit curve
            ├── Result.jsx      # Metrics, harmonics panel, verdict, warnings
            └── Panel.jsx       # Shared card wrapper
```

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Flask runs on `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server runs on `http://localhost:5173`.

---

## Recording a Coin Drop

Getting a clean recording directly affects classification accuracy.

**Equipment:** Any phone or recorder that records `.wav` files. Built-in phone mics work.

**Procedure:**
1. Place the microphone **10–15 cm** from the drop point.
2. Drop the coin from **exactly 30 cm** — use a ruler or fixed guide.
3. Record in a **quiet room** — fan noise, AC, and traffic raise the noise floor and can corrupt the decay tail.
4. Start recording **before** the drop so there is at least 1 second of silence at the beginning.
5. Allow the ring to **fully decay** before stopping (2–3 seconds after impact).
6. Export or save as **mono `.wav`** at any standard sample rate — the backend resamples to 44 100 Hz automatically.

**What to avoid:**
- Clipping (recording too loud — distorts the waveform)
- Catching the coin after it lands — let it settle naturally so the ring fully decays
- Talking or handling noise during the ring
- Recording on surfaces other than the two supported ones (Tile, Wood)

If the analysis returns a **Low SNR** warning, the recording was too quiet relative to background noise — move the mic closer or record in a quieter environment.

---

## API Reference

### `GET /`

Health check.

```json
{
  "status": "Coin tester backend running",
  "version": "1.0",
  "coin": "₱1 NGC"
}
```

### `POST /analyze`

Accepts a multipart form with:

| Field | Type | Description |
|---|---|---|
| `file` | `.wav` file | The coin drop recording |
| `denomination` | string | `"1"`, `"5"`, `"10"`, or `"20"` |
| `surface` | string | `"Tile"` or `"Wood"` |
| `dropHeight` | integer | Drop height in cm (fixed at 30) |

**Response:**

```json
{
  "f0":         3241.5,
  "alpha":      14.8321,
  "Q":          686.4,
  "f0_norm":    3306.6,
  "alpha_norm": 13.484,
  "r_squared":  0.9712,
  "snr_db":      28.3,
  "snr_warning": false,
  "alpha_warning": false,
  "harmonics": [
    { "n": 2, "freq": 6487.2, "mag_db": -18.4, "ratio": 2.0013 },
    { "n": 3, "freq": 9721.5, "mag_db": -31.1, "ratio": 2.9994 }
  ],
  "onset":      4410,
  "onset_time": 0.1,
  "alpha_ci":   [13.1, 16.5],
  "verdict":    "Genuine",
  "confidence": 78.4,
  "denomination": "1",
  "coin_label": "₱1 NGC",
  "scores": {
    "genuine_score":     78.4,
    "counterfeit_score": 12.1
  },
  "waveform": { "samples": [...], "sample_rate": 44100, "onset_index": 4410 },
  "fft":     { "freqs": [...], "magnitudes_db": [...], "f0": 3241.5, "f0_bin": 74, "harmonics": [...] },
  "decay":   { "times": [...], "envelope": [...], "fit": [...], "alpha": 14.83, "A": 0.98 },
  "meta":    { "drop_height": 30, "surface": "Tile", "denomination": "1" }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | No file uploaded, or file is not `.wav` |
| 422 | File uploaded but audio data is invalid or too short |
| 500 | Unexpected analysis failure |

---

## DSP Pipeline Details

### Onset Detection

Computes short-time RMS energy in overlapping 512-sample windows (256-sample hop). The noise floor is estimated from the **quietest 20 consecutive frames** anywhere in the recording. The onset anchors on the **loudest frame** (the actual coin impact) and walks backwards until the signal drops below `noise_floor × 8`. This is robust to pre-drop handling noise — which is quieter than the coin impact and would fool a forward threshold-crossing search.

### Dynamic Ring Window

Instead of a fixed 500 ms segment, the window extends until the RMS envelope drops to `max(5% of peak, 2 × noise_floor)`, capped at 2.5 seconds. On hard surfaces genuine coins ring for 1–2+ seconds; the dynamic window captures the full decay tail needed for a reliable α estimate. On wood, the threshold is met quickly and the window terminates early.

### FFT

Segment is zero-padded to the next power of 2 for consistent bin resolution, then a Hanning window is applied to reduce spectral leakage. The dominant peak (f₀) is selected as the most prominent peak in 200–8 000 Hz using `scipy.signal.find_peaks` with a 6 dB prominence threshold. The 2nd and 3rd harmonics are then found by searching ±15% bands around 2×f₀ and 3×f₀.

### Decay Fitting

`scipy.optimize.curve_fit` fits `A·e^(−αt)` to the normalized RMS envelope with bounds `A ∈ [0, 10]`, `α ∈ [0, 500]`. The goodness-of-fit R² and 95% confidence interval on α are computed. If curve_fit fails to converge, a log-linear regression fallback is used. R² < 0.85 triggers a "noisy recording or double impact" warning.

### Surface Normalization

Measured f₀ and α are divided by surface-specific scale factors before classification:

| Surface | α scale | f₀ scale |
|---|---|---|
| Tile | 1.00 | 1.00 |
| Wood | 1.75 | 0.94 |

This brings all measurements to a Tile-equivalent baseline so a single set of coin profiles applies across surfaces.

### Classifier

Scores the normalized features `[f₀, α, harmonic_ratio]` against genuine and counterfeit ranges using a soft distance function: score = 1.0 at the centroid of the range, 0.0 at the boundary, averaged across features × 100. Q-factor is **not** a classifier input — it is derived deterministically from f₀ and α, so including it would double-count information.

**α is excluded from scoring when R² < 0.3.** On hard surfaces (Tile) coins often bounce multiple times, producing a non-exponential envelope and an unreliable α estimate. Excluding it when the fit is poor prevents a bad decay fit from overriding a valid f₀ and harmonic match.

The genuine and counterfeit harmonic_ratio ranges are intentionally non-overlapping. Genuine steel coins produce 2nd harmonics close to 2× f₀ (range 1.70–2.30). The counterfeit range (1.20–1.70) targets coins with irregular casting that produce flatter, inharmonic spectra.

Verdict logic:
- `genuine_score > counterfeit_score` and `genuine_score ≥ 15` → **Genuine**
- `genuine_score > counterfeit_score` and `genuine_score < 15` → **Suspect**
- `counterfeit_score ≥ genuine_score` → **Counterfeit**

---

## Calibrating the Profiles

The acoustic profiles in `DENOMINATION_PROFILES` (in `signal.py`) are starting estimates. Accuracy depends entirely on how well these ranges match the actual coins and recording setup being used.

**To calibrate:**

1. Collect at least **20 genuine drops** and **10 counterfeit drops** per denomination on **Tile** at **30 cm**, using the same recording setup.
2. Extract f₀, α, and harmonic_ratio from each recording.
3. For each feature, compute `mean ± 1.5 × std` across the genuine drops → that is the new genuine range.
4. Repeat for counterfeit drops.
5. Update the ranges in `DENOMINATION_PROFILES`.
6. Repeat for **Wood** with genuine coins only, compute `mean_α_surface / mean_α_tile` and `mean_f0_surface / mean_f0_tile`, and update `SURFACE_CORRECTIONS`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask, librosa, scipy, numpy |
| Frontend | React 19, Vite, Tailwind CSS v4, Recharts |
| Audio DSP | librosa (loading/resampling), numpy FFT, scipy curve_fit |
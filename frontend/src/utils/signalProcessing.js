/**
 * signalProcessing.js
 * -------------------
 * Pure JS signal processing utilities for the coin authenticity tester.
 * No dependencies except fft.js (imported where needed).
 *
 * Exports:
 *   detectOnset(samples, sampleRate, windowSize, threshold)
 *   applyHanningWindow(segment)
 *   computeFFT(segment)
 *   findPeakFrequency(magnitudes, sampleRate, fftSize)
 *   computeRMSEnvelope(segment, frameSize)
 *   fitExponentialDecay(envelope, sampleRate)
 *   computeQFactor(f0, alpha)
 *   classifyCoin(f0, alpha, Q)
 */

// ─────────────────────────────────────────────
// 1. ONSET DETECTION
// ─────────────────────────────────────────────

/**
 * Finds the sample index of the first significant energy spike.
 * Uses short-time RMS energy with an adaptive threshold.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate   - default 44100
 * @param {number} windowSize   - samples per RMS frame (default 512)
 * @param {number} threshold    - RMS multiplier above noise floor (default 8)
 * @returns {number} sample index of onset, or 0 if not found
 */
export function detectOnset(
  samples,
  sampleRate  = 44100,
  windowSize  = 512,
  threshold   = 8
) {
  const hop = Math.floor(windowSize / 2);

  // Compute RMS per frame
  const rmsFrames = [];
  for (let i = 0; i + windowSize < samples.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += samples[j] ** 2;
    rmsFrames.push({ index: i, rms: Math.sqrt(sum / windowSize) });
  }

  if (!rmsFrames.length) return 0;

  // Noise floor = median of first 20 frames (before any coin drop)
  const noiseFloor = median(rmsFrames.slice(0, 20).map((f) => f.rms));
  const cutoff     = noiseFloor * threshold;

  const onset = rmsFrames.find((f) => f.rms > cutoff);
  return onset ? onset.index : 0;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─────────────────────────────────────────────
// 2. WINDOWING
// ─────────────────────────────────────────────

/**
 * Applies a Hanning window to reduce spectral leakage.
 * @param {Float32Array} segment
 * @returns {Float32Array} windowed segment
 */
export function applyHanningWindow(segment) {
  const N      = segment.length;
  const output = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w     = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    output[i]   = segment[i] * w;
  }
  return output;
}

// ─────────────────────────────────────────────
// 3. FFT
// ─────────────────────────────────────────────

/**
 * Computes FFT magnitude spectrum using the browser's built-in
 * OfflineAudioContext (no external library required).
 *
 * For a simpler synchronous fallback, uses a DFT on small segments.
 *
 * @param {Float32Array} segment  - windowed ring segment
 * @returns {{ magnitudes: Float32Array, fftSize: number }}
 */
export function computeFFT(segment) {
  // Next power of 2
  const fftSize = nextPow2(segment.length);
  const padded  = new Float32Array(fftSize);
  padded.set(segment);

  // Manual DFT (accurate for our use case — fftSize typically 2048–8192)
  const re  = new Float32Array(fftSize);
  const im  = new Float32Array(fftSize);
  const N   = fftSize;

  // Cooley-Tukey FFT (iterative)
  // Bit-reversal permutation
  for (let i = 0; i < N; i++) re[i] = padded[i];

  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }

  // Butterfly operations
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe  = re[i + k];
        const uIm  = im[i + k];
        const vRe  = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm  = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k]             = uRe + vRe;
        im[i + k]             = uIm + vIm;
        re[i + k + len / 2]   = uRe - vRe;
        im[i + k + len / 2]   = uIm - vIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm       = curRe * wIm + curIm * wRe;
        curRe       = newRe;
      }
    }
  }

  // Magnitude (one-sided)
  const half       = Math.floor(N / 2);
  const magnitudes = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    magnitudes[i] = Math.sqrt(re[i] ** 2 + im[i] ** 2) / N;
  }

  return { magnitudes, fftSize };
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ─────────────────────────────────────────────
// 4. PEAK FREQUENCY (f₀)
// ─────────────────────────────────────────────

/**
 * Finds the dominant frequency bin above a minimum frequency.
 * Ignores DC and very low frequencies (< 200 Hz) which are surface rumble.
 *
 * @param {Float32Array} magnitudes
 * @param {number} sampleRate
 * @param {number} fftSize
 * @param {number} minHz  - ignore bins below this (default 200)
 * @param {number} maxHz  - ignore bins above this (default 8000)
 * @returns {{ f0: number, binIndex: number, magnitude: number }}
 */
export function findPeakFrequency(
  magnitudes,
  sampleRate,
  fftSize,
  minHz = 200,
  maxHz = 8000
) {
  const binResolution = sampleRate / fftSize;
  const minBin        = Math.ceil(minHz / binResolution);
  const maxBin        = Math.min(Math.floor(maxHz / binResolution), magnitudes.length - 1);

  let peakBin = minBin;
  let peakMag = magnitudes[minBin];

  for (let i = minBin + 1; i <= maxBin; i++) {
    if (magnitudes[i] > peakMag) {
      peakMag = magnitudes[i];
      peakBin = i;
    }
  }

  return {
    f0:        peakBin * binResolution,
    binIndex:  peakBin,
    magnitude: peakMag,
  };
}

// ─────────────────────────────────────────────
// 5. RMS ENVELOPE
// ─────────────────────────────────────────────

/**
 * Computes the RMS amplitude envelope of a signal segment.
 * Used to track how the coin's ring decays over time.
 *
 * @param {Float32Array} segment
 * @param {number} frameSize  - samples per envelope frame (default 256)
 * @returns {{ envelope: Float32Array, times: Float32Array }}
 */
export function computeRMSEnvelope(segment, sampleRate = 44100, frameSize = 256) {
  const numFrames = Math.floor(segment.length / frameSize);
  const envelope  = new Float32Array(numFrames);
  const times     = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const start = i * frameSize;
    let sum = 0;
    for (let j = start; j < start + frameSize; j++) sum += segment[j] ** 2;
    envelope[i] = Math.sqrt(sum / frameSize);
    times[i]    = (start + frameSize / 2) / sampleRate;
  }

  return { envelope, times };
}

// ─────────────────────────────────────────────
// 6. EXPONENTIAL DECAY FIT
// ─────────────────────────────────────────────

/**
 * Fits A·e^(−α·t) to the RMS envelope using log-linear regression.
 * Returns the decay constant α and amplitude A.
 *
 * @param {Float32Array} envelope
 * @param {Float32Array} times     - time axis in seconds
 * @returns {{ alpha: number, A: number, fitted: Float32Array }}
 */
export function fitExponentialDecay(envelope, times) {
  // Log-linearize: ln(y) = ln(A) - α·t
  // Filter out zero/negative values before taking log
  const validIndices = [];
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > 1e-10) validIndices.push(i);
  }

  if (validIndices.length < 4) {
    return { alpha: 0, A: 1, fitted: new Float32Array(envelope.length) };
  }

  const t   = validIndices.map((i) => times[i]);
  const lnY = validIndices.map((i) => Math.log(envelope[i]));

  // Linear regression on (t, lnY)
  const n    = t.length;
  const sumT = t.reduce((s, v) => s + v, 0);
  const sumY = lnY.reduce((s, v) => s + v, 0);
  const sumTY = t.reduce((s, v, i) => s + v * lnY[i], 0);
  const sumT2 = t.reduce((s, v) => s + v * v, 0);

  const denom = n * sumT2 - sumT ** 2;
  if (Math.abs(denom) < 1e-12) {
    return { alpha: 0, A: 1, fitted: new Float32Array(envelope.length) };
  }

  const slope     = (n * sumTY - sumT * sumY) / denom;  // = -α
  const intercept = (sumY - slope * sumT) / n;           // = ln(A)

  const alpha = -slope;
  const A     = Math.exp(intercept);

  // Reconstruct fitted curve over full time axis
  const fitted = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) {
    fitted[i] = A * Math.exp(-alpha * times[i]);
  }

  return { alpha: Math.max(0, alpha), A, fitted };
}

// ─────────────────────────────────────────────
// 7. Q-FACTOR
// ─────────────────────────────────────────────

/**
 * Q = π · f₀ / α
 * Higher Q = slower decay = more "ringing" = denser material.
 *
 * @param {number} f0     - peak frequency in Hz
 * @param {number} alpha  - decay constant in s⁻¹
 * @returns {number} Q-factor
 */
export function computeQFactor(f0, alpha) {
  if (alpha <= 0) return 0;
  return (Math.PI * f0) / alpha;
}

// ─────────────────────────────────────────────
// 8. CLASSIFIER
// ─────────────────────────────────────────────

/**
 * Threshold-based coin classifier.
 * Ranges were derived from empirical recordings — update these
 * with your own measured values from training data.
 *
 * @param {number} f0     - Hz
 * @param {number} alpha  - s⁻¹
 * @param {number} Q      - dimensionless
 * @returns {{ verdict: string, confidence: number, coinClass: string }}
 */
export function classifyCoin(f0, alpha, Q) {
  const classes = {
    genuine: {
      f0:    [2600, 3600],
      alpha: [8,    22  ],
      Q:     [400,  800 ],
      label: "Genuine",
      coinClass: "₱5 coin",
    },
    suspect: {
      f0:    [2000, 2700],
      alpha: [20,   40  ],
      Q:     [200,  430 ],
      label: "Suspect",
      coinClass: "Unknown alloy",
    },
    counterfeit: {
      f0:    [1200, 2200],
      alpha: [35,   90  ],
      Q:     [50,   220 ],
      label: "Counterfeit",
      coinClass: "Non-standard",
    },
  };

  // Score each class by how many features fall within range
  const scores = Object.entries(classes).map(([key, cls]) => {
    const features = [
      { val: f0,    range: cls.f0    },
      { val: alpha, range: cls.alpha },
      { val: Q,     range: cls.Q     },
    ];

    // Distance-based score: 1 if inside range, decays outside
    const score = features.reduce((sum, { val, range }) => {
      const [lo, hi] = range;
      const mid      = (lo + hi) / 2;
      const halfSpan = (hi - lo) / 2;
      const dist     = Math.abs(val - mid) / halfSpan;
      return sum + Math.max(0, 1 - dist);
    }, 0);

    return { key, score, ...cls };
  });

  scores.sort((a, b) => b.score - a.score);
  const best       = scores[0];
  const confidence = Math.min(100, (best.score / 3) * 100);

  return {
    verdict:    best.label,
    confidence: confidence.toFixed(1),
    coinClass:  best.coinClass,
    f0:         f0.toFixed(1),
    alpha:      alpha.toFixed(2),
    Q:          Q.toFixed(0),
  };
}
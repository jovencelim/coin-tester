"""
app.py
------
Flask backend for the ₱1 NGC coin authenticity tester.

Endpoints:
  GET  /          — health check
  POST /analyze   — accepts a .wav file + optional metadata,
                    returns JSON analysis result
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

import tempfile
import os

from services.signal import analyze_coin

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    return jsonify({
        "status":  "Coin tester backend running",
        "version": "1.0",
        "coin":    "₱1 NGC",
    })


@app.route("/analyze", methods=["POST"])
def analyze():

    # ── Validate file presence ──
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file.filename.lower().endswith(".wav"):
        return jsonify({"error": "Only .wav files are supported"}), 400

    # ── Parse experiment metadata from form fields ──
    meta = {
        "drop_height":  request.form.get("dropHeight",   30,      type=int),
        "surface":      request.form.get("surface",      "Glass"),
        "denomination": request.form.get("denomination", "1"),     # "1"|"5"|"10"|"20"
    }

    # ── Save to temp file and analyze ──
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav"
        ) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        result = analyze_coin(tmp_path, meta)
        return jsonify(result)

    except ValueError as e:
        # Bad audio data — client error
        return jsonify({"error": f"Invalid audio: {str(e)}"}), 422

    except Exception as e:
        # Unexpected server error — don't crash, return clean message
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

    finally:
        # Always clean up temp file even if analysis throws
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    app.run(debug=True)
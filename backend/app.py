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

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file.filename.lower().endswith(".wav"):
        return jsonify({"error": "Only .wav files are supported"}), 400

    meta = {
        "drop_height":  request.form.get("dropHeight",   30,      type=int),
        "surface":      request.form.get("surface",      "Tile"),
        "denomination": request.form.get("denomination", "1"), 
    }

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
        return jsonify({"error": f"Invalid audio: {str(e)}"}), 422

    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    app.run(debug=True)
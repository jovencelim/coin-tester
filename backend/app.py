from flask import Flask, request, jsonify
from flask_cors import CORS

import tempfile
import os

from services.signal import analyze_coin

app = Flask(__name__)

CORS(app)


@app.route("/")
def home():
    return {
        "status": "Coin tester backend running"
    }


@app.route("/analyze", methods=["POST"])
def analyze():

    if "file" not in request.files:
        return jsonify({
            "error": "No file uploaded"
        }), 400

    file = request.files["file"]

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".wav"
    ) as temp:

        file.save(temp.name)

        result = analyze_coin(temp.name)

    os.unlink(temp.name)

    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
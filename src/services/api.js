import axios from "axios";

export async function sendAudio(blob) {
  const formData = new FormData();
  formData.append("file", blob, "coin.wav");

  const res = await axios.post("http://localhost:8000/analyze", formData);
  return res.data;
}
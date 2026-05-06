export async function analyzeAudio(file) {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch("http://127.0.0.1:5000/analyze", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Backend analysis failed");
  }

  return data;
}

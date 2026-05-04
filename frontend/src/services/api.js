export async function sendAudio(file, metadata) {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("dropHeight", metadata.dropHeight);
  formData.append("surface", metadata.surface);

  const res = await fetch("http://localhost:8000/analyze", {
    method: "POST",
    body: formData,
  });

  return await res.json();
}
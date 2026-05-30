async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/browser/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width: 1280, height: 800 })
    });
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Data:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();

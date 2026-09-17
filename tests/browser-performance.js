async page => {
  const shapes = [];
  for (let row = 0; row < 25; row += 1) {
    for (let column = 0; column < 40; column += 1) {
      const index = row * 40 + column;
      shapes.push({
        id: `perf-${index}`,
        type: "line",
        x1: column * 20,
        y1: row * 20,
        x2: column * 20 + 12,
        y2: row * 20 + 8
      });
    }
  }
  const project = {
    schemaVersion: 1,
    name: "Performance 1000",
    unit: "mm",
    gridMm: 10,
    shapes,
    dimensions: [],
    snapOptions: {
      endpoint: true,
      midpoint: true,
      center: true,
      edge: true,
      intersection: true,
      grid: true,
      perpendicular: true,
      orthogonal: true
    }
  };

  await page.evaluate(value => localStorage.setItem("scalesketch.autosave.v1", JSON.stringify(value)), project);
  const reloadStarted = Date.now();
  await page.reload();
  await page.locator("#drawingCanvas .shape").nth(999).waitFor();
  const reloadMs = Date.now() - reloadStarted;

  const samples = await page.evaluate(() => {
    const svg = document.querySelector("#drawingCanvas");
    const box = svg.getBoundingClientRect();
    const timings = [];
    for (let index = 0; index < 120; index += 1) {
      const started = performance.now();
      svg.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 5 + ((index * 37) % Math.max(10, box.width - 10)),
        clientY: box.top + 5 + ((index * 23) % Math.max(10, box.height - 10))
      }));
      timings.push(performance.now() - started);
    }
    return timings.sort((a, b) => a - b);
  });
  const percentile = fraction => samples[Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)];
  return {
    objects: await page.locator("#drawingCanvas .shape").count(),
    reloadMs,
    pointerMedianMs: percentile(0.5),
    pointerP95Ms: percentile(0.95),
    viewport: await page.viewportSize()
  };
}

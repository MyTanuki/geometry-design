async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(250);

  const toClient = point => page.evaluate(p => {
    const svg = document.querySelector("#drawingCanvas");
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    return {
      x: rect.left + ((p.x - view.x) / view.width) * rect.width,
      y: rect.top + ((p.y - view.y) / view.height) * rect.height
    };
  }, point);
  const clickWorld = async point => {
    const target = await toClient(point);
    await page.mouse.click(target.x, target.y);
  };

  await page.getByRole("button", { name: "↔ วัด" }).click();
  await clickWorld({ x: 40, y: 45 });
  await clickWorld({ x: 280, y: 45 });
  const aligned = await page.evaluate(() => {
    const dimension = [...document.querySelectorAll("[data-dimension-label]")].at(-1);
    return { id: dimension.dataset.dimensionLabel, text: dimension.textContent, y: dimension.getBoundingClientRect().y };
  });

  await page.getByRole("button", { name: "↖ เลือก" }).click();
  const labelBox = await page.locator(`[data-dimension-label="${aligned.id}"]`).boundingBox();
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const movedLabel = await page.locator(`[data-dimension-label="${aligned.id}"]`).boundingBox();

  await page.getByRole("button", { name: "↔ วัด" }).click();
  await page.getByLabel("ชนิดการวัด").selectOption("radius");
  await clickWorld({ x: 428, y: 115 });
  await page.getByLabel("ชนิดการวัด").selectOption("angle");
  await clickWorld({ x: 40, y: 45 });
  await clickWorld({ x: 280, y: 45 });
  await clickWorld({ x: 40, y: 185 });
  const labels = await page.evaluate(() => [...document.querySelectorAll("[data-dimension-label]")].map(node => node.textContent));

  return {
    alignedUsesSnap: aligned.text === "240.000 mm",
    labelRepositioned: Math.abs(movedLabel.y - aligned.y) > 40,
    radius: labels.includes("R 58.000 mm"),
    rightAngle: labels.includes("90.000°")
  };
}

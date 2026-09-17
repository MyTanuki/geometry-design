async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  const readLine = () => page.evaluate(() => {
    const line = document.querySelector('#shapeLayer [data-id="example-line"]');
    return {
      x1: Number(line.getAttribute("x1")),
      y1: Number(line.getAttribute("y1")),
      x2: Number(line.getAttribute("x2")),
      y2: Number(line.getAttribute("y2"))
    };
  });
  const toClient = point => page.evaluate(p => {
    const svg = document.querySelector("#drawingCanvas");
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    return {
      x: rect.left + ((p.x - view.x) / view.width) * rect.width,
      y: rect.top + ((p.y - view.y) / view.height) * rect.height
    };
  }, point);

  const line = page.locator('#shapeLayer [data-id="example-line"]');
  const endpointStart = await toClient({ x: 430, y: 230 });
  const endpointTarget = await toClient({ x: 402, y: 182 });
  await page.mouse.move(endpointStart.x, endpointStart.y);
  await page.mouse.down();
  await page.mouse.move(endpointTarget.x, endpointTarget.y, { steps: 8 });
  await page.mouse.up();

  const afterEndpoint = await readLine();
  const endpointStatus = await page.locator("#statusMessage").textContent();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  const afterUndo = await readLine();
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  const afterRedo = await readLine();

  const movedLineBox = await line.boundingBox();
  await page.mouse.move(movedLineBox.x + movedLineBox.width / 2, movedLineBox.y + movedLineBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedLineBox.x + movedLineBox.width / 2 + 36, movedLineBox.y + movedLineBox.height / 2 + 24, { steps: 6 });
  await page.mouse.up();
  const afterCenter = await readLine();

  return {
    handles: await page.locator('.line-endpoint-handle[data-shape-id="example-line"]').count(),
    afterEndpoint,
    fixedEndpointStayed: afterEndpoint.x1 === 40 && afterEndpoint.y1 === 230,
    draggedEndpointChanged: afterEndpoint.x2 === 400 && afterEndpoint.y2 === 180,
    endpointSnappedToGrid: afterEndpoint.x2 === 400 && afterEndpoint.y2 === 180,
    endpointStatus,
    undoRestored: afterUndo.x1 === 40 && afterUndo.y1 === 230 && afterUndo.x2 === 430 && afterUndo.y2 === 230,
    redoRestoredEdit: JSON.stringify(afterRedo) === JSON.stringify(afterEndpoint),
    centerMovedBothEqually: Math.abs((afterCenter.x1 - afterRedo.x1) - (afterCenter.x2 - afterRedo.x2)) < 1e-7
      && Math.abs((afterCenter.y1 - afterRedo.y1) - (afterCenter.y2 - afterRedo.y2)) < 1e-7
  };
}

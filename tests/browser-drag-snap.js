async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const close = (actual, expected) => Math.abs(actual - expected) < 0.001;

  const reset = async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(250);
  };
  const toClient = point => page.evaluate(p => {
    const svg = document.querySelector("#drawingCanvas");
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    return {
      x: rect.left + ((p.x - view.x) / view.width) * rect.width,
      y: rect.top + ((p.y - view.y) / view.height) * rect.height
    };
  }, point);
  const drag = async (from, to) => {
    const start = await toClient(from);
    const end = await toClient(to);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  };

  await reset();
  await drag({ x: 430, y: 230 }, { x: 368, y: 116 });
  const snappedEndpoint = await page.evaluate(() => {
    const line = document.querySelector('#shapeLayer [data-id="example-line"]');
    return { x: Number(line.getAttribute("x2")), y: Number(line.getAttribute("y2")) };
  });

  await reset();
  await drag({ x: 370, y: 115 }, { x: 161, y: 115 });
  const snappedObject = await page.evaluate(() => {
    const circle = document.querySelector('#shapeLayer [data-id="example-circle"]');
    return { x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) };
  });

  await reset();
  await page.getByRole("button", { name: "ปิดทั้งหมด" }).click();
  await page.locator('[data-snap="grid"]').check();
  await drag({ x: 370, y: 115 }, { x: 382, y: 122 });
  const snappedGridObject = await page.evaluate(() => {
    const circle = document.querySelector('#shapeLayer [data-id="example-circle"]');
    return { x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) };
  });

  await reset();
  await page.getByRole("button", { name: "ปิดทั้งหมด" }).click();
  await page.locator('[data-snap="grid"]').check();
  const marqueeStart = await toClient({ x: 25, y: 30 });
  const marqueeEnd = await toClient({ x: 445, y: 195 });
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 8 });
  await page.mouse.up();
  await drag({ x: 160, y: 115 }, { x: 188, y: 122 });
  const snappedGroup = await page.evaluate(() => {
    const rectangle = document.querySelector('#shapeLayer [data-id="example-rect"]');
    const circle = document.querySelector('#shapeLayer [data-id="example-circle"]');
    return {
      selected: document.querySelectorAll("#objectList button.active").length,
      rectangleX: Number(rectangle.getAttribute("x")),
      rectangleY: Number(rectangle.getAttribute("y")),
      circleX: Number(circle.getAttribute("cx")),
      circleY: Number(circle.getAttribute("cy"))
    };
  });

  return {
    endpointToCenter: close(snappedEndpoint.x, 370) && close(snappedEndpoint.y, 115),
    objectToCenter: close(snappedObject.x, 160) && close(snappedObject.y, 115),
    objectToGrid: close(snappedGridObject.x, 380) && close(snappedGridObject.y, 120),
    groupToGrid: snappedGroup.selected === 4
      && close(snappedGroup.rectangleX, 70) && close(snappedGroup.rectangleY, 50)
      && close(snappedGroup.circleX, 400) && close(snappedGroup.circleY, 120)
  };
}

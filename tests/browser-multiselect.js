async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  const toClient = point => page.evaluate(p => {
    const svg = document.querySelector("#drawingCanvas");
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    return {
      x: rect.left + ((p.x - view.x) / view.width) * rect.width,
      y: rect.top + ((p.y - view.y) / view.height) * rect.height
    };
  }, point);

  const start = await toClient({ x: 25, y: 30 });
  const end = await toClient({ x: 445, y: 195 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  const marqueeVisible = await page.locator(".selection-marquee").count() === 1;
  await page.mouse.up();

  const selectedAfterMarquee = await page.locator("#objectList button.active").count();
  const summaryAfterMarquee = await page.locator("#selectionSummary").textContent();
  const multiHeading = await page.getByRole("heading", { name: "เลือก 4 วัตถุ" }).count();

  const rectangle = page.locator('#shapeLayer [data-id="example-rect"]');
  const circle = page.locator('#shapeLayer [data-id="example-circle"]');
  const before = {
    rectangleX: Number(await rectangle.getAttribute("x")),
    circleX: Number(await circle.getAttribute("cx"))
  };
  const rectangleBox = await rectangle.boundingBox();
  await page.mouse.move(rectangleBox.x + rectangleBox.width / 2, rectangleBox.y + rectangleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rectangleBox.x + rectangleBox.width / 2 + 40, rectangleBox.y + rectangleBox.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  const after = {
    rectangleX: Number(await rectangle.getAttribute("x")),
    circleX: Number(await circle.getAttribute("cx"))
  };

  await page.getByRole("button", { name: "ทำสำเนา 4 วัตถุ" }).click();
  const totalAfterCopy = await page.locator("#objectCount").textContent();
  const selectedAfterCopy = await page.locator("#objectList button.active").count();
  await page.keyboard.press("Delete");

  return {
    marqueeVisible,
    selectedAfterMarquee,
    summaryAfterMarquee,
    multiHeading,
    groupMoveDelta: {
      rectangle: after.rectangleX - before.rectangleX,
      circle: after.circleX - before.circleX
    },
    totalAfterCopy,
    selectedAfterCopy,
    totalAfterDelete: await page.locator("#objectCount").textContent(),
    selectedAfterDelete: await page.locator("#objectList button.active").count()
  };
}

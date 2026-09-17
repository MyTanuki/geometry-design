async page => {
  const result = {};
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();

  result.title = await page.title();
  result.initialObjects = await page.getByText("5 วัตถุ", { exact: true }).count();
  result.consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });

  await page.getByRole("button", { name: "╱ เส้น" }).click();
  await page.getByLabel("พิกัด X").fill("1");
  await page.getByLabel("พิกัด Y").fill("1");
  await page.getByRole("button", { name: "วางจุด" }).click();
  await page.getByLabel("พิกัด X").fill("2");
  await page.getByLabel("พิกัด Y").fill("1");
  await page.getByRole("button", { name: "วางจุด" }).click();
  result.exactOneMillimetre = await page.getByText(/ความยาว 1\.000 mm/).count();

  await page.getByRole("button", { name: "ขยาย" }).click();
  await page.getByRole("button", { name: "ขยาย" }).click();
  result.zoomInvariant = await page.getByText(/ความยาว 1\.000 mm/).count();

  await page.keyboard.press("Escape");
  result.escapeReturnsToSelect = await page.locator('[data-tool="select"]').getAttribute("aria-pressed") === "true"
    && await page.locator("#modeName").textContent() === "เลือก";

  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  result.undoObjects = await page.getByText("5 วัตถุ", { exact: true }).count();
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  result.redoObjects = await page.getByText(/6 วัตถุ/).count();

  await page.getByLabel("พิกัด X").fill("100");
  await page.getByLabel("พิกัด Y").fill("20");
  await page.getByLabel("หน่วย").selectOption("cm");
  const centimetres = [Number(await page.getByLabel("พิกัด X").inputValue()), Number(await page.getByLabel("พิกัด Y").inputValue())];
  await page.getByLabel("หน่วย").selectOption("in");
  const inches = [Number(await page.getByLabel("พิกัด X").inputValue()), Number(await page.getByLabel("พิกัด Y").inputValue())];
  await page.getByLabel("หน่วย").selectOption("mm");
  const millimetres = [Number(await page.getByLabel("พิกัด X").inputValue()), Number(await page.getByLabel("พิกัด Y").inputValue())];
  result.unitSwitchPreservesExactCoordinates = centimetres[0] === 10 && centimetres[1] === 2
    && Math.abs(inches[0] * 25.4 - 100) < 0.0001 && Math.abs(inches[1] * 25.4 - 20) < 0.0001
    && Math.abs(millimetres[0] - 100) < 0.0001 && Math.abs(millimetres[1] - 20) < 0.0001;

  const snapToggle = page.getByRole("button", { name: "ปิดทั้งหมด" });
  await snapToggle.click();
  result.snapsOff = await page.locator("[data-snap]:checked").count() === 0;
  await page.getByRole("button", { name: "เปิดทั้งหมด" }).click();
  result.snapsOn = await page.locator("[data-snap]:checked").count() === 8;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForTimeout(50);
  result.mobileExactFormVisible = await page.getByRole("form", { name: "ป้อนพิกัดที่แน่นอน" }).isVisible();
  const inspector = page.locator(".inspector");
  result.mobileInspectorCollapsedInert = await inspector.evaluate(node => node.hasAttribute("inert") && node.getAttribute("aria-hidden") === "true");
  const inspectorToggle = page.getByRole("button", { name: /เปิดแผงคุณสมบัติ|ปิดแผงคุณสมบัติ/ });
  result.mobileInspectorToggleVisible = await inspectorToggle.isVisible();
  if (result.mobileInspectorToggleVisible) await inspectorToggle.click();
  result.mobileInspectorExpanded = await inspectorToggle.getAttribute("aria-expanded") === "true";
  result.mobileInspectorActive = await inspector.evaluate(node => !node.hasAttribute("inert") && node.getAttribute("aria-hidden") === "false");
  await page.keyboard.press("Escape");
  result.mobileInspectorEscapeCloses = await inspectorToggle.getAttribute("aria-expanded") === "false";
  result.mobileNoHorizontalScroll = await page.evaluate(() => scrollX === 0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForTimeout(250);
  const exampleLine = page.locator('#shapeLayer [data-id="example-line"]');
  const lineBox = await exampleLine.boundingBox();
  if (lineBox) {
    await page.mouse.move(1, 1);
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
    await page.waitForTimeout(50);
  }
  result.hoverAngleVisible = await page.locator("#angleBadge").isVisible();
  result.hoverAngleText = await page.locator("#angleBadge").textContent();
  const exampleRectangle = page.locator('#shapeLayer [data-id="example-rect"]');
  const rectangleBox = await exampleRectangle.boundingBox();
  if (rectangleBox) {
    await page.mouse.move(1, 1);
    await page.mouse.move(rectangleBox.x + rectangleBox.width, rectangleBox.y + rectangleBox.height / 2);
    await page.waitForTimeout(50);
  }
  result.hoverRightAngleText = await page.locator("#angleBadge").textContent();
  result.autosaved = Boolean(await page.evaluate(() => localStorage.getItem("scalesketch.autosave.v1")));
  result.consoleErrors = result.consoleErrors.slice();
  return result;
}

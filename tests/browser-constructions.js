async page => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const place = async (x, y) => {
    await page.getByLabel("พิกัด X").fill(String(x));
    await page.getByLabel("พิกัด Y").fill(String(y));
    await page.getByRole("button", { name: "วางจุด" }).click();
  };
  const savedDocument = async () => {
    await page.waitForTimeout(220);
    return page.evaluate(() => JSON.parse(localStorage.getItem("scalesketch.autosave.v1")));
  };

  await page.getByRole("button", { name: "○ วงกลม" }).click();
  await place(100, 100);
  await place(150, 100);
  let document = await savedDocument();
  const circle = document.shapes.find(shape => shape.type === "circle" && shape.cx === 100 && shape.cy === 100);

  await page.getByRole("button", { name: "◯̸ สัมผัส" }).click();
  await place(200, 100);
  await place(150, 100);

  await page.getByRole("button", { name: "⊖ คอร์ด" }).click();
  await place(150, 100);
  await place(100, 150);

  await page.getByRole("button", { name: "⊘ ตัดวง" }).click();
  await place(20, 100);
  await place(200, 100);

  await page.getByRole("button", { name: "⊥ ตั้งฉาก" }).click();
  await place(100, 300);
  await place(100, 230);

  await page.getByRole("button", { name: "↔ วัด" }).click();
  await place(0, 0);
  await place(3, 4);

  document = await savedDocument();
  const counts = document.shapes.reduce((result, shape) => {
    const type = shape.construction?.type;
    if (type) result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  const dimension = document.dimensions.at(-1);
  const measureLength = Math.hypot(
    dimension.b.point.x - dimension.a.point.x,
    dimension.b.point.y - dimension.a.point.y
  );

  await page.getByRole("tab", { name: "วัตถุ" }).click();
  await page.locator(`button[data-id="${circle.id}"]`).click();
  await page.getByRole("tab", { name: "คุณสมบัติ" }).click();
  await page.getByLabel("รัศมี").fill("40");
  await page.getByLabel("รัศมี").press("Tab");
  document = await savedDocument();
  const changedCircle = document.shapes.find(shape => shape.id === circle.id);
  const tangent = document.shapes.find(shape => shape.construction?.type === "tangent" && shape.construction.circleId === circle.id);
  const chord = document.shapes.find(shape => shape.construction?.type === "chord" && shape.construction.circleId === circle.id);
  const secant = document.shapes.find(shape => shape.construction?.type === "secant" && shape.construction.circleId === circle.id);
  const tangentDistance = Math.abs(
    (tangent.y2 - tangent.y1) * changedCircle.cx
    - (tangent.x2 - tangent.x1) * changedCircle.cy
    + tangent.x2 * tangent.y1
    - tangent.y2 * tangent.x1
  ) / Math.hypot(tangent.y2 - tangent.y1, tangent.x2 - tangent.x1);
  const onCircle = point => Math.abs(Math.hypot(point.x - changedCircle.cx, point.y - changedCircle.cy) - changedCircle.r) < 1e-7;

  return {
    circleCreated: Boolean(circle) && circle.r === 50,
    constructionCounts: counts,
    measureLength,
    tangentRemainsExactAfterCircleEdit: Math.abs(tangentDistance - 40) < 1e-7,
    chordRemainsOnCircleAfterEdit: onCircle({ x: chord.x1, y: chord.y1 }) && onCircle({ x: chord.x2, y: chord.y2 }),
    secantMarkersUpdateAfterCircleEdit: secant.construction.intersections.every(onCircle),
    relationLabels: await page.locator(".construction").count()
  };
}

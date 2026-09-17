async page => {
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1918, height: 880 });
  await page.reload();
  await page.getByRole("tab", { name: "วัตถุ" }).click();
  await page.locator('#objectList button[data-id="example-line"]').click();
  await page.getByRole("tab", { name: "คุณสมบัติ" }).click();

  const scenarios = [
    { width: 1918, height: 880 },
    { width: 1280, height: 720 },
    { width: 1100, height: 600 },
    { width: 981, height: 500 },
    { width: 900, height: 500 },
    { width: 640, height: 420 },
    { width: 1280, height: 260 }
  ];
  const results = [];

  for (const scenario of scenarios) {
    await page.setViewportSize(scenario);
    await page.waitForTimeout(200);
    const menu = page.locator("#moreMenu");
    if (await menu.isHidden()) await page.locator("#moreBtn").click();
    results.push(await page.evaluate(size => {
      const rect = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const overflow = selector => {
        const node = document.querySelector(selector);
        return node ? {
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          overflowX: getComputedStyle(node).overflowX,
          overflowY: getComputedStyle(node).overflowY
        } : null;
      };
      const lastTool = document.querySelector(".tool-rail .tool-button:last-child")?.getBoundingClientRect();
      const toolRail = document.querySelector(".tool-rail")?.getBoundingClientRect();
      const menu = document.querySelector("#moreMenu")?.getBoundingClientRect();
      const workspaceOverflow = overflow(".workspace");
      const inspectorRect = rect(".inspector");
      const toolReachable = lastTool && toolRail
        ? lastTool.bottom <= toolRail.bottom + 1 || document.querySelector(".tool-rail").scrollHeight > document.querySelector(".tool-rail").clientHeight
        : false;
      const checks = {
        pageHasNoHorizontalScroll: document.documentElement.scrollWidth <= innerWidth + 1,
        workspaceContained: workspaceOverflow ? workspaceOverflow.scrollWidth <= workspaceOverflow.clientWidth + 1 : false,
        inspectorContained: inspectorRect ? inspectorRect.left >= -1 && inspectorRect.right <= innerWidth + 1 : false,
        toolReachable,
        menuContained: menu ? menu.bottom <= innerHeight + 1 : false
      };
      return {
        requested: size,
        viewport: { width: innerWidth, height: innerHeight },
        root: overflow("html"),
        body: overflow("body"),
        topbar: overflow(".topbar"),
        workspace: workspaceOverflow,
        canvasToolbar: overflow(".canvas-toolbar"),
        inspector: { rect: inspectorRect, overflow: overflow(".inspector"), visible: getComputedStyle(document.querySelector(".inspector")).visibility },
        toolRail: { overflow: overflow(".tool-rail"), lastToolBottom: lastTool?.bottom, railBottom: toolRail?.bottom },
        menu: { rect: rect("#moreMenu"), overflow: overflow("#moreMenu"), exceedsBottom: menu ? menu.bottom > innerHeight : false },
        scroll: { x: scrollX, y: scrollY },
        checks,
        passed: Object.values(checks).every(Boolean)
      };
    }, scenario));
    await page.locator("#moreBtn").click();
  }
  return results;
}

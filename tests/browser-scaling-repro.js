async page => {
  const scenarios = [
    { name: "reported-150-percent", width: 1280, height: 586, zoom: 1 },
    { name: "reported-width-taller", width: 1280, height: 720, zoom: 1 },
    { name: "css-zoom-125", width: 1918, height: 880, zoom: 1.25 },
    { name: "css-zoom-150", width: 1918, height: 880, zoom: 1.5 },
    { name: "page-scale-125", width: 1918, height: 880, zoom: 1, pageScale: 1.25 },
    { name: "page-scale-150", width: 1918, height: 880, zoom: 1, pageScale: 1.5 },
    { name: "standard-desktop", width: 1918, height: 880 },
    { name: "narrow-desktop", width: 1100, height: 600 }
  ];
  const results = [];
  const cdp = await page.context().newCDPSession(page);

  for (const scenario of scenarios) {
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scenario.pageScale ?? 1 });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.reload();
    await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, scenario.zoom ?? 1);
    await page.waitForTimeout(100);
    results.push(await page.evaluate(name => {
      const measure = selector => {
        const node = document.querySelector(selector);
        const rect = node?.getBoundingClientRect();
        return node && rect ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          minWidth: getComputedStyle(node).minWidth,
          overflowX: getComputedStyle(node).overflowX,
          overflowY: getComputedStyle(node).overflowY
        } : null;
      };
      const lastTool = document.querySelector(".tool-rail .tool-button:last-child")?.getBoundingClientRect();
      const rail = document.querySelector(".tool-rail")?.getBoundingClientRect();
      const inspector = document.querySelector(".inspector")?.getBoundingClientRect();
      return {
        name,
        viewport: {
          innerWidth,
          innerHeight,
          visualWidth: visualViewport?.width,
          visualHeight: visualViewport?.height,
          visualScale: visualViewport?.scale,
          devicePixelRatio
        },
        html: measure("html"),
        body: measure("body"),
        shell: measure(".app-shell"),
        topbar: measure(".topbar"),
        workspace: measure(".workspace"),
        rail: measure(".tool-rail"),
        canvas: measure(".canvas-panel"),
        toolbar: measure(".canvas-toolbar"),
        inspector: measure(".inspector"),
        gridColumns: getComputedStyle(document.querySelector(".workspace")).gridTemplateColumns,
        inspectorContained: inspector ? inspector.left >= -0.5 && inspector.right <= (visualViewport?.width ?? innerWidth) + 0.5 : false,
        lastToolVisible: lastTool && rail ? lastTool.top >= rail.top && lastTool.bottom <= rail.bottom + 0.5 : false,
        lastToolReachable: lastTool && rail ? lastTool.bottom <= rail.bottom + 0.5 || document.querySelector(".tool-rail").scrollHeight > document.querySelector(".tool-rail").clientHeight : false,
        lastTool: lastTool ? { top: lastTool.top, bottom: lastTool.bottom } : null
      };
    }, scenario.name));
  }

  return results;
}

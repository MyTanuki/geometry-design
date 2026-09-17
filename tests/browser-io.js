async page => {
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const filenames = {};

  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "บันทึกไฟล์" }).click();
  filenames.json = (await pending).suggestedFilename();

  await page.getByRole("button", { name: "เมนูเพิ่มเติม" }).click();
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออก SVG" }).click();
  filenames.svg = (await pending).suggestedFilename();

  await page.getByRole("button", { name: "เมนูเพิ่มเติม" }).click();
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออก PNG" }).click();
  filenames.png = (await pending).suggestedFilename();

  await page.locator("#fileInput").setInputFiles("tests/fixtures/valid.json");
  await page.waitForFunction(() => document.querySelector("#documentName")?.value === "Imported exact rectangle");
  const validImportObjects = await page.getByText(/1 วัตถุ/).count();

  await page.locator("#fileInput").setInputFiles("tests/fixtures/invalid-duplicate-id.json");
  await page.getByText(/เปิดไฟล์ไม่ได้: พบ ID วัตถุซ้ำหรือไม่ถูกต้อง/).first().waitFor();

  return {
    filenames,
    validImportObjects,
    invalidImportRejected: await page.locator("#documentName").inputValue() === "Imported exact rectangle",
    consoleErrors
  };
}

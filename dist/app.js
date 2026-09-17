import {
  EPSILON,
  circleCircleIntersections,
  distance,
  lineCircleIntersections,
  lineLineIntersection,
  midpoint,
  nearestPointOnCircle,
  nearestPointOnEllipse,
  projectPointToSegment,
  segmentAngleDegrees,
  tangentPointsFromPoint
} from "./geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "scalesketch.autosave.v1";
const SCHEMA_VERSION = 1;
const BASE_SCALE = 1.65;
const SNAP_TOLERANCE_PX = 10;
const MAX_HISTORY = 100;
const UNIT_FACTORS = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const TYPE_NAMES = {
  line: "เส้นตรง",
  rectangle: "สี่เหลี่ยม",
  circle: "วงกลม",
  ellipse: "วงรี",
  dimension: "ระยะวัด"
};
const SNAP_NAMES = {
  endpoint: "ปลายเส้น",
  midpoint: "กึ่งกลาง",
  center: "ศูนย์กลาง",
  quadrant: "จุดควอแดรนต์",
  edge: "ขอบ",
  intersection: "จุดตัด",
  grid: "กริด",
  perpendicular: "ตั้งฉาก",
  horizontal: "แนวนอน",
  vertical: "แนวตั้ง"
};
const SNAP_PRIORITY = {
  endpoint: 0,
  intersection: 1,
  center: 2,
  midpoint: 3,
  perpendicular: 4,
  quadrant: 5,
  horizontal: 6,
  vertical: 6,
  edge: 7,
  grid: 8
};
const TOOL_COPY = {
  select: ["เลือก", "คลิกหรือลากวัตถุเพื่อแก้ไข"],
  line: ["เส้นตรง", "คลิกจุดเริ่มและจุดปลาย"],
  rectangle: ["สี่เหลี่ยม", "คลิกสองมุมตรงข้าม"],
  circle: ["วงกลม", "คลิกศูนย์กลาง แล้วคลิกกำหนดรัศมี"],
  ellipse: ["วงรี", "คลิกศูนย์กลาง แล้วคลิกกำหนดแกน X/Y"],
  measure: ["วัดระยะ", "เลือกสองตำแหน่งเพื่อสร้าง Dimension"],
  perpendicular: ["เส้นตั้งฉาก", "เลือกจุดเริ่ม แล้วคลิกใกล้ขอบอ้างอิง"],
  tangent: ["เส้นสัมผัส", "เลือกจุดภายนอก แล้วคลิกวงกลม"],
  secant: ["เส้นตัดวงกลม", "เลือกจุดเริ่ม แล้วกำหนดแนวที่ตัดวงกลม"],
  chord: ["คอร์ด", "เลือกสองจุดบนวงกลมเดียวกัน"]
};

const dom = {
  svg: document.querySelector("#drawingCanvas"),
  surface: document.querySelector("#drawingSurface"),
  modeName: document.querySelector("#modeName"),
  modeHint: document.querySelector("#modeHint"),
  cursorPosition: document.querySelector("#cursorPosition"),
  selectionSummary: document.querySelector("#selectionSummary"),
  statusMessage: document.querySelector("#statusMessage"),
  snapBadge: document.querySelector("#snapBadge"),
  angleBadge: document.querySelector("#angleBadge"),
  properties: document.querySelector("#propertiesPanel"),
  objectList: document.querySelector("#objectList"),
  objectCount: document.querySelector("#objectCount"),
  documentBounds: document.querySelector("#documentBounds"),
  unitSelect: document.querySelector("#unitSelect"),
  gridSize: document.querySelector("#gridSize"),
  documentName: document.querySelector("#documentName"),
  exactX: document.querySelector("#exactX"),
  exactY: document.querySelector("#exactY"),
  zoomValue: document.querySelector("#zoomValue"),
  undo: document.querySelector("#undoBtn"),
  redo: document.querySelector("#redoBtn"),
  toggleAllSnaps: document.querySelector("#toggleAllSnaps"),
  moreButton: document.querySelector("#moreBtn"),
  moreMenu: document.querySelector("#moreMenu"),
  fileInput: document.querySelector("#fileInput"),
  helpDialog: document.querySelector("#helpDialog"),
  liveRegion: document.querySelector("#liveRegion"),
  layers: {
    grid: document.querySelector("#gridLayer"),
    shapes: document.querySelector("#shapeLayer"),
    dimensions: document.querySelector("#dimensionLayer"),
    guides: document.querySelector("#guideLayer"),
    interaction: document.querySelector("#interactionLayer")
  }
};

const compactInspectorQuery = matchMedia("(max-width: 980px)");

function isCompactViewport() {
  return compactInspectorQuery.matches || document.querySelector(".app-shell")?.classList.contains("compact-viewport");
}

function syncAppViewportBounds() {
  const shell = document.querySelector(".app-shell");
  const rootWidth = document.documentElement.clientWidth || innerWidth;
  const rootHeight = document.documentElement.clientHeight || innerHeight;
  const bodyWidth = document.body.clientWidth || rootWidth;
  const bodyHeight = document.body.clientHeight || rootHeight;
  const viewportWidth = Math.max(1, Math.min(rootWidth, bodyWidth, window.visualViewport?.width ?? rootWidth));
  const viewportHeight = Math.max(1, Math.min(rootHeight, bodyHeight, window.visualViewport?.height ?? rootHeight));
  shell.style.setProperty("--app-viewport-width", `${viewportWidth}px`);
  shell.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
  shell.classList.toggle("compact-viewport", viewportWidth <= 980);
  shell.classList.toggle("mobile-viewport", viewportWidth <= 620);
}

function setInspectorOpen(open, moveFocus = true) {
  const inspector = document.querySelector(".inspector");
  const compact = isCompactViewport();
  const visible = compact && open;
  inspector.classList.toggle("open", visible);
  const inactive = compact && !visible;
  inspector.inert = inactive;
  if (inactive) inspector.setAttribute("inert", "");
  else inspector.removeAttribute("inert");
  if (compact) inspector.setAttribute("aria-hidden", String(!visible));
  else inspector.removeAttribute("aria-hidden");
  const toggle = document.querySelector("#inspectorToggle");
  toggle.setAttribute("aria-expanded", String(visible));
  toggle.setAttribute("aria-label", visible ? "ปิดแผงคุณสมบัติ" : "เปิดแผงคุณสมบัติ");
  if (!visible && window.scrollX) window.scrollTo(0, window.scrollY);
  if (!moveFocus) return;
  if (visible) requestAnimationFrame(() => inspector.querySelector('[role="tab"][aria-selected="true"]')?.focus());
  else toggle.focus();
}

function syncInspectorMode() {
  if (isCompactViewport()) setInspectorOpen(document.querySelector(".inspector").classList.contains("open"), false);
  else setInspectorOpen(false, false);
}

function uid(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createExampleDocument() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "แบบร่างตัวอย่าง",
    unit: "mm",
    gridMm: 10,
    shapes: [
      { id: "example-rect", type: "rectangle", x: 40, y: 45, width: 240, height: 140 },
      { id: "example-circle", type: "circle", cx: 370, cy: 115, r: 58 },
      { id: "example-line", type: "line", x1: 40, y1: 230, x2: 430, y2: 230 }
    ],
    dimensions: [
      {
        id: "example-dim-width",
        type: "dimension",
        a: { ref: { shapeId: "example-rect", anchor: "corner-0" }, point: { x: 40, y: 45 } },
        b: { ref: { shapeId: "example-rect", anchor: "corner-1" }, point: { x: 280, y: 45 } }
      },
      {
        id: "example-dim-radius",
        type: "dimension",
        a: { ref: { shapeId: "example-circle", anchor: "center" }, point: { x: 370, y: 115 } },
        b: { ref: { shapeId: "example-circle", anchor: "quadrant-0" }, point: { x: 428, y: 115 } },
        prefix: "R "
      }
    ],
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
}

const state = {
  document: createExampleDocument(),
  tool: "select",
  selectedId: null,
  selectedIds: [],
  operation: null,
  pointer: { x: 0, y: 0 },
  currentSnap: null,
  hoverAngle: null,
  candidates: [],
  candidateIndex: 0,
  camera: { cx: 220, cy: 145, zoom: 1 },
  history: [],
  future: [],
  drag: null,
  marquee: null,
  pan: null,
  spaceDown: false,
  saveTimer: null,
  initialized: false
};

function svgElement(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  return node;
}

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function finitePoint(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function currentScale() {
  return BASE_SCALE * state.camera.zoom;
}

function viewRect() {
  const bounds = dom.svg.getBoundingClientRect();
  const width = Math.max(1, bounds.width) / currentScale();
  const height = Math.max(1, bounds.height) / currentScale();
  return { x: state.camera.cx - width / 2, y: state.camera.cy - height / 2, width, height };
}

function setViewBox() {
  const view = viewRect();
  dom.svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  dom.zoomValue.value = `${Math.round(state.camera.zoom * 100)}%`;
}

function toDisplay(mm) {
  return mm / UNIT_FACTORS[state.document.unit];
}

function fromDisplay(value) {
  return value * UNIT_FACTORS[state.document.unit];
}

function formatNumber(value, decimals = 3) {
  const clean = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
  return clean.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
}

function formatLength(mm, decimals = 3) {
  return `${formatNumber(toDisplay(mm), decimals)} ${state.document.unit}`;
}

function formatArea(squareMm) {
  const factor = UNIT_FACTORS[state.document.unit];
  return `${formatNumber(squareMm / (factor * factor), 3)} ${state.document.unit}²`;
}

function announce(message) {
  dom.statusMessage.textContent = message;
  dom.liveRegion.textContent = "";
  requestAnimationFrame(() => { dom.liveRegion.textContent = message; });
}

function snapshot() {
  return clone({ document: state.document, selectedId: state.selectedId, selectedIds: state.selectedIds });
}

function restoreSnapshot(value) {
  state.document = clone(value.document);
  const restoredSelection = Array.isArray(value.selectedIds) ? value.selectedIds : value.selectedId ? [value.selectedId] : [];
  setSelection(restoredSelection);
  state.operation = null;
  state.currentSnap = null;
  state.candidates = [];
  state.marquee = null;
  refreshConstructions();
  syncControls();
  renderAll();
  scheduleAutosave();
}

function pushHistory(previous) {
  state.history.push(previous || snapshot());
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.future = [];
  updateHistoryButtons();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  restoreSnapshot(state.history.pop());
  updateHistoryButtons();
  announce("ย้อนกลับแล้ว");
}

function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  restoreSnapshot(state.future.pop());
  updateHistoryButtons();
  announce("ทำซ้ำแล้ว");
}

function updateHistoryButtons() {
  dom.undo.disabled = state.history.length === 0;
  dom.redo.disabled = state.future.length === 0;
}

function documentPayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: state.document.name,
    unit: state.document.unit,
    gridMm: state.document.gridMm,
    shapes: state.document.shapes,
    dimensions: state.document.dimensions,
    snapOptions: state.document.snapOptions
  };
}

function scheduleAutosave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(documentPayload()));
      document.querySelector(".autosave").lastChild.textContent = "บันทึกในเครื่องแล้ว";
    } catch {
      document.querySelector(".autosave").lastChild.textContent = "บันทึกอัตโนมัติไม่ได้";
    }
  }, 180);
}

function validatePoint(p, label) {
  if (!finitePoint(p)) throw new Error(`${label} ต้องมีพิกัดที่เป็นตัวเลข`);
}

function validateProject(input) {
  if (!input || typeof input !== "object") throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error(`ไม่รองรับ schemaVersion ${input.schemaVersion ?? "ที่หายไป"}`);
  if (!Array.isArray(input.shapes) || !Array.isArray(input.dimensions)) throw new Error("ไฟล์ไม่มีรายการวัตถุที่ถูกต้อง");
  const ids = new Set();
  for (const shape of [...input.shapes, ...input.dimensions]) {
    if (!shape || typeof shape.id !== "string" || !shape.id || ids.has(shape.id)) throw new Error("พบ ID วัตถุซ้ำหรือไม่ถูกต้อง");
    ids.add(shape.id);
    if (shape.type === "line") {
      validatePoint({ x: shape.x1, y: shape.y1 }, "จุดเริ่มเส้น");
      validatePoint({ x: shape.x2, y: shape.y2 }, "จุดปลายเส้น");
    } else if (shape.type === "rectangle") {
      validatePoint({ x: shape.x, y: shape.y }, "ตำแหน่งสี่เหลี่ยม");
      if (!(shape.width > 0) || !(shape.height > 0) || !Number.isFinite(shape.width + shape.height)) throw new Error("ขนาดสี่เหลี่ยมไม่ถูกต้อง");
    } else if (shape.type === "circle") {
      validatePoint({ x: shape.cx, y: shape.cy }, "ศูนย์กลางวงกลม");
      if (!(shape.r > 0) || !Number.isFinite(shape.r)) throw new Error("รัศมีวงกลมไม่ถูกต้อง");
    } else if (shape.type === "ellipse") {
      validatePoint({ x: shape.cx, y: shape.cy }, "ศูนย์กลางวงรี");
      if (!(shape.rx > 0) || !(shape.ry > 0) || !Number.isFinite(shape.rx + shape.ry)) throw new Error("รัศมีวงรีไม่ถูกต้อง");
    } else if (shape.type === "dimension") {
      validatePoint(shape.a?.point, "จุดวัด A");
      validatePoint(shape.b?.point, "จุดวัด B");
    } else {
      throw new Error(`ไม่รู้จักวัตถุชนิด ${shape.type}`);
    }
  }
  const shapesById = new Map(input.shapes.map(shape => [shape.id, shape]));
  for (const shape of input.shapes) {
    const relation = shape.construction;
    if (!relation) continue;
    if (shape.type !== "line" || typeof relation !== "object") throw new Error("ข้อมูล Construction ไม่ถูกต้อง");
    const knownTypes = new Set(["tangent", "secant", "chord", "perpendicular"]);
    if (!knownTypes.has(relation.type)) throw new Error("ชนิด Construction ไม่ถูกต้อง");
    if (["tangent", "secant", "chord"].includes(relation.type)) {
      const circle = shapesById.get(relation.circleId);
      if (circle?.type !== "circle") throw new Error("Construction ต้องอ้างถึงวงกลมที่มีอยู่");
    }
    if (relation.type === "tangent") {
      const external = relation.externalRef?.point || relation.external;
      validatePoint(external, "จุดภายนอกของเส้นสัมผัส");
    }
    if (relation.type === "chord" && ![relation.angle1, relation.angle2].every(Number.isFinite)) {
      throw new Error("มุมของ Chord ไม่ถูกต้อง");
    }
    if (relation.type === "perpendicular" && !shapesById.has(relation.edgeShapeId)) {
      throw new Error("เส้นตั้งฉากอ้างถึงขอบที่ไม่มีอยู่");
    }
  }
  const validUnits = Object.keys(UNIT_FACTORS);
  if (!validUnits.includes(input.unit)) throw new Error("หน่วยในไฟล์ไม่ถูกต้อง");
  if (!(input.gridMm > 0) || !Number.isFinite(input.gridMm)) throw new Error("ขนาดกริดไม่ถูกต้อง");
  for (const shape of input.shapes) {
    const related = shape.construction?.circleId;
    if (related && !ids.has(related)) throw new Error("พบความสัมพันธ์ที่อ้างถึงวัตถุซึ่งไม่มีอยู่");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    name: typeof input.name === "string" ? input.name.slice(0, 80) : "แบบร่าง",
    unit: input.unit,
    gridMm: input.gridMm,
    shapes: clone(input.shapes),
    dimensions: clone(input.dimensions),
    snapOptions: { ...createExampleDocument().snapOptions, ...(input.snapOptions || {}) }
  };
}

function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    state.document = validateProject(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

function findShape(id) {
  return state.document.shapes.find(shape => shape.id === id) || null;
}

function findEntity(id) {
  return findShape(id) || state.document.dimensions.find(item => item.id === id) || null;
}

function rectCorners(shape) {
  return [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
    { x: shape.x, y: shape.y + shape.height }
  ];
}

function shapeSegments(shape) {
  if (shape.type === "line") return [{ a: { x: shape.x1, y: shape.y1 }, b: { x: shape.x2, y: shape.y2 }, shapeId: shape.id, edge: 0 }];
  if (shape.type !== "rectangle") return [];
  const corners = rectCorners(shape);
  return corners.map((a, index) => ({ a, b: corners[(index + 1) % 4], shapeId: shape.id, edge: index }));
}

function resolveRef(anchor) {
  if (!anchor?.ref) return anchor?.point ? { ...anchor.point } : null;
  const shape = findShape(anchor.ref.shapeId);
  if (!shape) return anchor.point ? { ...anchor.point } : null;
  const name = anchor.ref.anchor;
  if (shape.type === "line") {
    if (name === "endpoint-0") return { x: shape.x1, y: shape.y1 };
    if (name === "endpoint-1") return { x: shape.x2, y: shape.y2 };
    if (name === "midpoint") return midpoint({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
  }
  if (shape.type === "rectangle") {
    const corners = rectCorners(shape);
    if (name.startsWith("corner-")) return corners[Number(name.slice(7))];
    if (name.startsWith("midpoint-")) {
      const index = Number(name.slice(9));
      return midpoint(corners[index], corners[(index + 1) % 4]);
    }
    if (name === "center") return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  if (shape.type === "circle") {
    if (name === "center") return { x: shape.cx, y: shape.cy };
    if (name.startsWith("quadrant-")) {
      const index = Number(name.slice(9));
      return [
        { x: shape.cx + shape.r, y: shape.cy },
        { x: shape.cx, y: shape.cy + shape.r },
        { x: shape.cx - shape.r, y: shape.cy },
        { x: shape.cx, y: shape.cy - shape.r }
      ][index];
    }
  }
  if (shape.type === "ellipse") {
    if (name === "center") return { x: shape.cx, y: shape.cy };
    if (name.startsWith("quadrant-")) {
      const index = Number(name.slice(9));
      return [
        { x: shape.cx + shape.rx, y: shape.cy },
        { x: shape.cx, y: shape.cy + shape.ry },
        { x: shape.cx - shape.rx, y: shape.cy },
        { x: shape.cx, y: shape.cy - shape.ry }
      ][index];
    }
  }
  return anchor.point ? { ...anchor.point } : null;
}

function anchorFromCandidate(candidate) {
  return {
    point: { ...candidate.point },
    ...(candidate.ref ? { ref: clone(candidate.ref) } : {})
  };
}

function refreshConstructions() {
  for (const shape of state.document.shapes) {
    if (shape.type !== "line" || !shape.construction) continue;
    const relation = shape.construction;
    const circle = findShape(relation.circleId);
    if (!circle || circle.type !== "circle") continue;
    if (relation.type === "tangent") {
      const external = relation.externalRef ? resolveRef(relation.externalRef) : relation.external;
      const solutions = tangentPointsFromPoint(external, { x: circle.cx, y: circle.cy }, circle.r);
      if (solutions.length) {
        const index = Math.min(relation.solution || 0, solutions.length - 1);
        shape.x1 = external.x;
        shape.y1 = external.y;
        shape.x2 = solutions[index].x;
        shape.y2 = solutions[index].y;
      }
    }
    if (relation.type === "chord") {
      shape.x1 = circle.cx + circle.r * Math.cos(relation.angle1);
      shape.y1 = circle.cy + circle.r * Math.sin(relation.angle1);
      shape.x2 = circle.cx + circle.r * Math.cos(relation.angle2);
      shape.y2 = circle.cy + circle.r * Math.sin(relation.angle2);
    }
    if (relation.type === "secant") {
      const hits = lineCircleIntersections(
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
        { x: circle.cx, y: circle.cy },
        circle.r,
        false
      );
      if (hits.length === 2) relation.intersections = hits.map(hit => hit.point);
      else delete shape.construction;
    }
  }
}

function renderGrid() {
  dom.layers.grid.replaceChildren();
  const view = viewRect();
  let grid = state.document.gridMm;
  while (grid * currentScale() < 9) grid *= 5;
  const left = Math.floor(view.x / grid) * grid;
  const right = view.x + view.width + grid;
  const top = Math.floor(view.y / grid) * grid;
  const bottom = view.y + view.height + grid;
  const maxLines = 320;
  let count = 0;
  for (let x = left; x <= right && count < maxLines; x += grid, count += 1) {
    const major = Math.abs(Math.round(x / grid)) % 5 === 0;
    dom.layers.grid.append(svgElement("line", {
      x1: x, y1: top, x2: x, y2: bottom,
      stroke: major ? "#d2dfe3" : "#e9eff1",
      "stroke-width": major ? 0.8 : 0.4,
      "vector-effect": "non-scaling-stroke"
    }));
  }
  count = 0;
  for (let y = top; y <= bottom && count < maxLines; y += grid, count += 1) {
    const major = Math.abs(Math.round(y / grid)) % 5 === 0;
    dom.layers.grid.append(svgElement("line", {
      x1: left, y1: y, x2: right, y2: y,
      stroke: major ? "#d2dfe3" : "#e9eff1",
      "stroke-width": major ? 0.8 : 0.4,
      "vector-effect": "non-scaling-stroke"
    }));
  }
  dom.layers.grid.append(
    svgElement("line", { x1: 0, y1: top, x2: 0, y2: bottom, stroke: "#9fbdc6", "stroke-width": 1.15, "vector-effect": "non-scaling-stroke" }),
    svgElement("line", { x1: left, y1: 0, x2: right, y2: 0, stroke: "#9fbdc6", "stroke-width": 1.15, "vector-effect": "non-scaling-stroke" })
  );
}

function shapeNode(shape, preview = false) {
  const className = `${preview ? "guide" : "shape shape-fill"}${isSelected(shape.id) ? " selected" : ""}${shape.construction ? " construction" : ""}`;
  if (shape.type === "line") return svgElement("line", { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, class: className });
  if (shape.type === "rectangle") return svgElement("rect", { x: shape.x, y: shape.y, width: shape.width, height: shape.height, class: className });
  if (shape.type === "circle") return svgElement("circle", { cx: shape.cx, cy: shape.cy, r: shape.r, class: className });
  if (shape.type === "ellipse") return svgElement("ellipse", { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry, class: className });
  return null;
}

function renderShapes() {
  dom.layers.shapes.replaceChildren();
  for (const shape of state.document.shapes) {
    const node = shapeNode(shape);
    if (!node) continue;
    node.dataset.id = shape.id;
    node.setAttribute("tabindex", "-1");
    dom.layers.shapes.append(node);
    if (shape.construction?.type === "secant" && Array.isArray(shape.construction.intersections)) {
      for (const p of shape.construction.intersections) {
        dom.layers.shapes.append(svgElement("circle", { cx: p.x, cy: p.y, r: 3.4 / currentScale(), class: "intersection-mark" }));
      }
    }
  }
  renderSelection();
}

function renderSelection() {
  for (const id of selectedEntityIds()) {
    const shape = findShape(id);
    if (!shape) continue;
    const points = [];
    if (shape.type === "line") points.push({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
    if (shape.type === "rectangle") points.push(...rectCorners(shape));
    if (shape.type === "circle") points.push({ x: shape.cx, y: shape.cy }, { x: shape.cx + shape.r, y: shape.cy });
    if (shape.type === "ellipse") points.push({ x: shape.cx, y: shape.cy }, { x: shape.cx + shape.rx, y: shape.cy }, { x: shape.cx, y: shape.cy + shape.ry });
    const size = (shape.type === "line" ? 8 : 6) / currentScale();
    for (const [index, p] of points.entries()) {
      dom.layers.shapes.append(svgElement("rect", {
        x: p.x - size / 2,
        y: p.y - size / 2,
        width: size,
        height: size,
        rx: 1 / currentScale(),
        class: `selection-handle${shape.type === "line" ? " line-endpoint-handle" : ""}`,
        ...(shape.type === "line" ? { "data-shape-id": shape.id, "data-endpoint": index } : {})
      }));
    }
  }
}

function renderDimensions() {
  dom.layers.dimensions.replaceChildren();
  for (const item of state.document.dimensions) {
    const a = resolveRef(item.a);
    const b = resolveRef(item.b);
    if (!a || !b) continue;
    const length = distance(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const safeLength = Math.max(length, EPSILON);
    const nx = -dy / safeLength;
    const ny = dx / safeLength;
    const offset = 15 / currentScale();
    const q1 = { x: a.x + nx * offset, y: a.y + ny * offset };
    const q2 = { x: b.x + nx * offset, y: b.y + ny * offset };
    const group = svgElement("g", { "data-id": item.id });
    const selected = isSelected(item.id) ? " selected" : "";
    group.append(
      svgElement("line", { x1: a.x, y1: a.y, x2: q1.x, y2: q1.y, class: `dimension-line${selected}` }),
      svgElement("line", { x1: b.x, y1: b.y, x2: q2.x, y2: q2.y, class: `dimension-line${selected}` }),
      svgElement("line", { x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y, class: `dimension-line${selected}` })
    );
    const tick = 4 / currentScale();
    group.append(
      svgElement("line", { x1: q1.x - nx * tick, y1: q1.y - ny * tick, x2: q1.x + nx * tick, y2: q1.y + ny * tick, class: "dimension-line" }),
      svgElement("line", { x1: q2.x - nx * tick, y1: q2.y - ny * tick, x2: q2.x + nx * tick, y2: q2.y + ny * tick, class: "dimension-line" })
    );
    const text = svgElement("text", {
      x: (q1.x + q2.x) / 2,
      y: (q1.y + q2.y) / 2 - 5 / currentScale(),
      class: "dimension-text",
      "font-size": 12 / currentScale(),
      "stroke-width": 4 / currentScale(),
      "text-anchor": "middle"
    });
    text.textContent = `${item.prefix || ""}${formatLength(length)}`;
    group.append(text);
    dom.layers.dimensions.append(group);
  }
}

function shapeBounds(shape) {
  if (shape.type === "line") return { minX: Math.min(shape.x1, shape.x2), minY: Math.min(shape.y1, shape.y2), maxX: Math.max(shape.x1, shape.x2), maxY: Math.max(shape.y1, shape.y2) };
  if (shape.type === "rectangle") return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.width, maxY: shape.y + shape.height };
  if (shape.type === "circle") return { minX: shape.cx - shape.r, minY: shape.cy - shape.r, maxX: shape.cx + shape.r, maxY: shape.cy + shape.r };
  if (shape.type === "ellipse") return { minX: shape.cx - shape.rx, minY: shape.cy - shape.ry, maxX: shape.cx + shape.rx, maxY: shape.cy + shape.ry };
  return null;
}

function entityBounds(entity) {
  const bounds = shapeBounds(entity);
  if (bounds || entity.type !== "dimension") return bounds;
  const a = resolveRef(entity.a);
  const b = resolveRef(entity.b);
  if (!a || !b) return null;
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

function selectionRect(a, b) {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

function entitiesInsideSelection(a, b) {
  const box = selectionRect(a, b);
  return [...state.document.shapes, ...state.document.dimensions]
    .filter(entity => {
      const bounds = entityBounds(entity);
      return bounds && bounds.minX >= box.minX && bounds.maxX <= box.maxX && bounds.minY >= box.minY && bounds.maxY <= box.maxY;
    })
    .map(entity => entity.id);
}

function documentBounds() {
  const all = state.document.shapes.map(shapeBounds).filter(Boolean);
  if (!all.length) return { minX: -50, minY: -50, maxX: 450, maxY: 270 };
  return {
    minX: Math.min(...all.map(item => item.minX)),
    minY: Math.min(...all.map(item => item.minY)),
    maxX: Math.max(...all.map(item => item.maxX)),
    maxY: Math.max(...all.map(item => item.maxY))
  };
}

function fitView() {
  const bounds = documentBounds();
  const surface = dom.svg.getBoundingClientRect();
  const width = Math.max(50, bounds.maxX - bounds.minX);
  const height = Math.max(50, bounds.maxY - bounds.minY);
  state.camera.cx = (bounds.minX + bounds.maxX) / 2;
  state.camera.cy = (bounds.minY + bounds.maxY) / 2;
  state.camera.zoom = Math.max(0.08, Math.min(8, 0.84 * Math.min(surface.width / (BASE_SCALE * width), surface.height / (BASE_SCALE * height))));
  renderScene();
}

function updateDocumentInfo() {
  const bounds = documentBounds();
  dom.documentBounds.textContent = `${formatLength(bounds.maxX - bounds.minX)} × ${formatLength(bounds.maxY - bounds.minY)}`;
  const total = state.document.shapes.length + state.document.dimensions.length;
  const selectedCount = selectedEntityIds().length;
  dom.selectionSummary.textContent = `${total} วัตถุ${selectedCount ? ` · เลือกแล้ว ${selectedCount}` : ""}`;
  dom.objectCount.textContent = String(total);
}

function renderObjectList() {
  dom.objectList.replaceChildren();
  const entities = [...state.document.shapes, ...state.document.dimensions];
  if (!entities.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = "ยังไม่มีวัตถุในเอกสาร";
    dom.objectList.append(empty);
    return;
  }
  entities.forEach((entity, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = entity.id;
    if (isSelected(entity.id)) button.classList.add("active");
    const icon = document.createElement("span");
    icon.textContent = { line: "╱", rectangle: "▭", circle: "○", ellipse: "⬭", dimension: "↔" }[entity.type] || "•";
    const name = document.createElement("span");
    name.textContent = `${TYPE_NAMES[entity.type]} ${index + 1}`;
    const tag = document.createElement("small");
    tag.textContent = entity.construction?.type?.toUpperCase() || entity.type.toUpperCase();
    button.append(icon, name, tag);
    button.addEventListener("click", () => selectEntity(entity.id));
    dom.objectList.append(button);
  });
}

function propertyField(label, path, value, options = {}) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = formatNumber(toDisplay(value));
  input.dataset.path = path;
  input.disabled = Boolean(options.disabled);
  input.addEventListener("change", onPropertyChange);
  wrapper.append(input);
  return wrapper;
}

function renderProperties() {
  dom.properties.replaceChildren();
  const selectedIds = selectedEntityIds();
  const entity = findEntity(state.selectedId);
  const heading = document.createElement("div");
  heading.className = "section-heading";
  const title = document.createElement("h2");
  const chip = document.createElement("span");
  chip.className = "type-chip";
  if (selectedIds.length > 1) {
    title.textContent = `เลือก ${selectedIds.length} วัตถุ`;
    chip.textContent = "MULTI";
    heading.append(title, chip);
    const message = document.createElement("p");
    message.className = "panel-empty";
    message.textContent = "ลากวัตถุชิ้นใดชิ้นหนึ่งเพื่อย้ายทั้งชุด หรือใช้คำสั่งด้านล่าง";
    dom.properties.append(heading, message, selectionActions(selectedIds.length));
    return;
  }
  if (!entity) {
    title.textContent = "ไม่มีวัตถุที่เลือก";
    chip.textContent = "DOCUMENT";
    heading.append(title, chip);
    const message = document.createElement("p");
    message.className = "panel-empty";
    message.textContent = "เลือกวัตถุบนพื้นที่วาดเพื่อดูและแก้ไขขนาดอย่างแม่นยำ";
    dom.properties.append(heading, message);
    return;
  }
  title.textContent = TYPE_NAMES[entity.type];
  chip.textContent = entity.construction?.type?.toUpperCase() || entity.type.toUpperCase();
  heading.append(title, chip);
  const form = document.createElement("div");
  form.className = "property-form";
  const locked = Boolean(entity.construction && ["tangent", "chord"].includes(entity.construction.type));
  if (entity.type === "line") {
    form.append(
      propertyField("X1", "x1", entity.x1, { disabled: locked }),
      propertyField("Y1", "y1", entity.y1, { disabled: locked }),
      propertyField("X2", "x2", entity.x2, { disabled: locked }),
      propertyField("Y2", "y2", entity.y2, { disabled: locked })
    );
    form.append(metricBlock(`ความยาว ${formatLength(distance({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }))}`));
  }
  if (entity.type === "rectangle") {
    form.append(
      propertyField("X", "x", entity.x), propertyField("Y", "y", entity.y),
      propertyField("ความกว้าง", "width", entity.width), propertyField("ความสูง", "height", entity.height)
    );
    form.append(metricBlock(`พื้นที่ ${formatArea(entity.width * entity.height)}\nเส้นรอบรูป ${formatLength(2 * (entity.width + entity.height))}`));
  }
  if (entity.type === "circle") {
    form.append(propertyField("Center X", "cx", entity.cx), propertyField("Center Y", "cy", entity.cy), propertyField("รัศมี", "r", entity.r));
    form.append(metricBlock(`เส้นผ่านศูนย์กลาง ${formatLength(2 * entity.r)}\nพื้นที่ ${formatArea(Math.PI * entity.r * entity.r)}\nเส้นรอบวง ${formatLength(2 * Math.PI * entity.r)}`));
  }
  if (entity.type === "ellipse") {
    form.append(propertyField("Center X", "cx", entity.cx), propertyField("Center Y", "cy", entity.cy), propertyField("รัศมี X", "rx", entity.rx), propertyField("รัศมี Y", "ry", entity.ry));
    const h = ((entity.rx - entity.ry) ** 2) / ((entity.rx + entity.ry) ** 2);
    const perimeter = Math.PI * (entity.rx + entity.ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    form.append(metricBlock(`พื้นที่ ${formatArea(Math.PI * entity.rx * entity.ry)}\nเส้นรอบรูป ≈ ${formatLength(perimeter)}`));
  }
  if (entity.type === "dimension") {
    const a = resolveRef(entity.a);
    const b = resolveRef(entity.b);
    form.append(
      propertyField("X1", "a.point.x", a.x, { disabled: Boolean(entity.a.ref) }),
      propertyField("Y1", "a.point.y", a.y, { disabled: Boolean(entity.a.ref) }),
      propertyField("X2", "b.point.x", b.x, { disabled: Boolean(entity.b.ref) }),
      propertyField("Y2", "b.point.y", b.y, { disabled: Boolean(entity.b.ref) })
    );
    form.append(metricBlock(`ระยะตรง ${formatLength(distance(a, b))}\nΔX ${formatLength(Math.abs(b.x - a.x))} · ΔY ${formatLength(Math.abs(b.y - a.y))}`));
  }
  if (entity.construction) {
    const note = document.createElement("div");
    note.className = "relation-note";
    note.textContent = {
      tangent: "เส้นนี้สัมพันธ์กับวงกลมแบบ Tangent และจะปรับตามเมื่อวงกลมเปลี่ยน",
      chord: "เส้นนี้เป็น Chord และปลายทั้งสองจะอยู่บนวงกลมเสมอ",
      secant: "เส้นนี้สร้างจากแนว Secant และแสดงจุดตัดกับวงกลม",
      perpendicular: "เส้นนี้สร้างตั้งฉากกับขอบอ้างอิง ณ เวลาที่วาด"
    }[entity.construction.type] || "Construction geometry";
    form.append(note);
  }
  form.append(selectionActions(1));
  dom.properties.append(heading, form);
}

function selectionActions(count) {
  const actions = document.createElement("div");
  actions.className = "property-actions";
  const duplicate = document.createElement("button");
  duplicate.type = "button";
  duplicate.textContent = count > 1 ? `ทำสำเนา ${count} วัตถุ` : "ทำสำเนา";
  duplicate.addEventListener("click", duplicateSelected);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = count > 1 ? `ลบ ${count} วัตถุ` : "ลบวัตถุ";
  remove.addEventListener("click", deleteSelected);
  actions.append(duplicate, remove);
  return actions;
}

function metricBlock(text) {
  const node = document.createElement("div");
  node.className = "property-metrics";
  node.style.whiteSpace = "pre-line";
  node.textContent = text;
  return node;
}

function setPath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i += 1) cursor = cursor[keys[i]];
  cursor[keys.at(-1)] = value;
}

function onPropertyChange(event) {
  const entity = findEntity(state.selectedId);
  const displayValue = Number(event.target.value);
  if (!entity || !Number.isFinite(displayValue)) {
    announce("ค่าที่กรอกต้องเป็นตัวเลข");
    renderProperties();
    return;
  }
  const value = fromDisplay(displayValue);
  const positivePaths = new Set(["width", "height", "r", "rx", "ry"]);
  if (positivePaths.has(event.target.dataset.path) && value <= 0) {
    announce("ขนาดต้องมากกว่า 0");
    renderProperties();
    return;
  }
  const before = snapshot();
  // A manually edited construction is now ordinary geometry. Keeping the old
  // relation would leave stale secant markers or a misleading perpendicular tag.
  if (entity.type === "line" && entity.construction) delete entity.construction;
  setPath(entity, event.target.dataset.path, value);
  pushHistory(before);
  refreshConstructions();
  renderAll();
  scheduleAutosave();
  announce("ปรับค่าตัวเลขแล้ว");
}

function renderScene() {
  setViewBox();
  renderGrid();
  renderShapes();
  renderDimensions();
  renderInteraction();
}

function renderAll() {
  renderScene();
  renderProperties();
  renderObjectList();
  updateDocumentInfo();
  updateHistoryButtons();
}

function clientToWorld(event) {
  const rect = dom.svg.getBoundingClientRect();
  const view = viewRect();
  return {
    x: view.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * view.width,
    y: view.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * view.height
  };
}

function distanceToBounds(p, bounds) {
  const dx = Math.max(bounds.minX - p.x, 0, p.x - bounds.maxX);
  const dy = Math.max(bounds.minY - p.y, 0, p.y - bounds.maxY);
  return Math.hypot(dx, dy);
}

function addCandidate(list, p, candidate, tolerance) {
  const d = distance(p, candidate.point);
  if (d <= tolerance) list.push({ ...candidate, distance: d });
}

function dragSnapOrigin() {
  if (!state.drag) return null;
  if (state.drag.kind === "endpoint") {
    return state.drag.endpoint === 0
      ? { x: state.drag.original.x2, y: state.drag.original.y2 }
      : { x: state.drag.original.x1, y: state.drag.original.y1 };
  }
  return state.drag.start;
}

function collectSnapCandidates(p) {
  const options = state.document.snapOptions;
  const tolerance = SNAP_TOLERANCE_PX / currentScale();
  const candidates = [];
  if (options.grid) {
    addCandidate(candidates, p, {
      point: {
        x: Math.round(p.x / state.document.gridMm) * state.document.gridMm,
        y: Math.round(p.y / state.document.gridMm) * state.document.gridMm
      },
      type: "grid"
    }, tolerance);
  }
  const draggedIds = new Set(state.drag?.kind === "translate" ? state.drag.ids : state.drag?.id ? [state.drag.id] : []);
  const nearbyShapes = state.document.shapes.filter(shape => {
    if (draggedIds.has(shape.id)) return false;
    const bounds = shapeBounds(shape);
    return bounds && distanceToBounds(p, bounds) <= tolerance * 2;
  });
  for (const shape of nearbyShapes) {
    if (shape.type === "line") {
      const a = { x: shape.x1, y: shape.y1 };
      const b = { x: shape.x2, y: shape.y2 };
      if (options.endpoint) {
        addCandidate(candidates, p, { point: a, type: "endpoint", ref: { shapeId: shape.id, anchor: "endpoint-0" }, shapeId: shape.id }, tolerance);
        addCandidate(candidates, p, { point: b, type: "endpoint", ref: { shapeId: shape.id, anchor: "endpoint-1" }, shapeId: shape.id }, tolerance);
      }
      if (options.midpoint) addCandidate(candidates, p, { point: midpoint(a, b), type: "midpoint", ref: { shapeId: shape.id, anchor: "midpoint" }, shapeId: shape.id }, tolerance);
      if (options.edge) addCandidate(candidates, p, { point: projectPointToSegment(p, a, b).point, type: "edge", shapeId: shape.id }, tolerance);
    }
    if (shape.type === "rectangle") {
      const corners = rectCorners(shape);
      if (options.endpoint) corners.forEach((corner, index) => addCandidate(candidates, p, { point: corner, type: "endpoint", ref: { shapeId: shape.id, anchor: `corner-${index}` }, shapeId: shape.id }, tolerance));
      if (options.midpoint) corners.forEach((corner, index) => addCandidate(candidates, p, { point: midpoint(corner, corners[(index + 1) % 4]), type: "midpoint", ref: { shapeId: shape.id, anchor: `midpoint-${index}` }, shapeId: shape.id }, tolerance));
      if (options.center) addCandidate(candidates, p, { point: { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, type: "center", ref: { shapeId: shape.id, anchor: "center" }, shapeId: shape.id }, tolerance);
      if (options.edge) shapeSegments(shape).forEach(segment => addCandidate(candidates, p, { point: projectPointToSegment(p, segment.a, segment.b).point, type: "edge", shapeId: shape.id, edge: segment.edge }, tolerance));
    }
    if (shape.type === "circle") {
      if (options.center) addCandidate(candidates, p, { point: { x: shape.cx, y: shape.cy }, type: "center", ref: { shapeId: shape.id, anchor: "center" }, shapeId: shape.id }, tolerance);
      const quadrants = [
        { x: shape.cx + shape.r, y: shape.cy }, { x: shape.cx, y: shape.cy + shape.r },
        { x: shape.cx - shape.r, y: shape.cy }, { x: shape.cx, y: shape.cy - shape.r }
      ];
      if (options.endpoint) quadrants.forEach((q, index) => addCandidate(candidates, p, { point: q, type: "quadrant", ref: { shapeId: shape.id, anchor: `quadrant-${index}` }, shapeId: shape.id, shapeType: "circle" }, tolerance));
      if (options.edge) addCandidate(candidates, p, { point: nearestPointOnCircle(p, { x: shape.cx, y: shape.cy }, shape.r), type: "edge", shapeId: shape.id, shapeType: "circle" }, tolerance);
    }
    if (shape.type === "ellipse") {
      if (options.center) addCandidate(candidates, p, { point: { x: shape.cx, y: shape.cy }, type: "center", ref: { shapeId: shape.id, anchor: "center" }, shapeId: shape.id }, tolerance);
      const quadrants = [
        { x: shape.cx + shape.rx, y: shape.cy }, { x: shape.cx, y: shape.cy + shape.ry },
        { x: shape.cx - shape.rx, y: shape.cy }, { x: shape.cx, y: shape.cy - shape.ry }
      ];
      if (options.endpoint) quadrants.forEach((q, index) => addCandidate(candidates, p, { point: q, type: "quadrant", ref: { shapeId: shape.id, anchor: `quadrant-${index}` }, shapeId: shape.id }, tolerance));
      if (options.edge) addCandidate(candidates, p, { point: nearestPointOnEllipse(p, { x: shape.cx, y: shape.cy }, shape.rx, shape.ry), type: "edge", shapeId: shape.id }, tolerance);
    }
  }
  const start = state.operation?.start?.point || dragSnapOrigin();
  const supportsDragSnap = Boolean(state.drag);
  if (start && options.orthogonal && (supportsDragSnap || ["line", "measure"].includes(state.tool))) {
    addCandidate(candidates, p, { point: { x: p.x, y: start.y }, type: "horizontal" }, tolerance);
    addCandidate(candidates, p, { point: { x: start.x, y: p.y }, type: "vertical" }, tolerance);
  }
  if (start && options.perpendicular && (supportsDragSnap || ["line", "perpendicular"].includes(state.tool))) {
    for (const shape of state.document.shapes) {
      if (draggedIds.has(shape.id)) continue;
      for (const segment of shapeSegments(shape)) {
        const projected = projectPointToSegment(start, segment.a, segment.b);
        addCandidate(candidates, p, { point: projected.point, type: "perpendicular", shapeId: shape.id, edge: segment.edge }, tolerance * 2.5);
      }
    }
  }
  if (options.intersection) {
    const primitives = [];
    for (const shape of nearbyShapes) {
      shapeSegments(shape).forEach(segment => primitives.push({ kind: "line", ...segment }));
      if (shape.type === "circle") primitives.push({ kind: "circle", center: { x: shape.cx, y: shape.cy }, radius: shape.r, shapeId: shape.id });
    }
    for (let i = 0; i < primitives.length; i += 1) {
      for (let j = i + 1; j < primitives.length; j += 1) {
        const a = primitives[i];
        const b = primitives[j];
        if (a.shapeId === b.shapeId) continue;
        let points = [];
        if (a.kind === "line" && b.kind === "line") {
          const hit = lineLineIntersection(a.a, a.b, b.a, b.b, true);
          if (hit) points = [hit.point];
        } else if (a.kind === "line" && b.kind === "circle") {
          points = lineCircleIntersections(a.a, a.b, b.center, b.radius, true).map(item => item.point);
        } else if (a.kind === "circle" && b.kind === "line") {
          points = lineCircleIntersections(b.a, b.b, a.center, a.radius, true).map(item => item.point);
        } else if (a.kind === "circle" && b.kind === "circle") {
          points = circleCircleIntersections(a.center, a.radius, b.center, b.radius);
        }
        points.forEach(point => addCandidate(candidates, p, { point, type: "intersection" }, tolerance));
      }
    }
  }
  const unique = [];
  for (const candidate of candidates) {
    const duplicate = unique.find(item => distance(item.point, candidate.point) < 1e-7 && item.type === candidate.type);
    if (!duplicate) unique.push(candidate);
  }
  unique.sort((a, b) => {
    const scoreA = a.distance * currentScale() + (SNAP_PRIORITY[a.type] ?? 20) * 0.04;
    const scoreB = b.distance * currentScale() + (SNAP_PRIORITY[b.type] ?? 20) * 0.04;
    return scoreA - scoreB || (a.type || "").localeCompare(b.type || "");
  });
  return unique;
}

function updateSnap(pointer, preserveIndex = false) {
  state.candidates = collectSnapCandidates(pointer);
  if (!preserveIndex) state.candidateIndex = 0;
  if (state.candidates.length) {
    state.candidateIndex = ((state.candidateIndex % state.candidates.length) + state.candidates.length) % state.candidates.length;
    state.currentSnap = state.candidates[state.candidateIndex];
  } else {
    state.currentSnap = { point: { ...pointer }, type: null };
    state.candidateIndex = 0;
  }
}

function previewShape() {
  if (!state.operation || !state.currentSnap) return null;
  const start = state.operation.start?.point;
  const end = state.currentSnap.point;
  if (state.tool === "line" && start) return { type: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  if (state.tool === "rectangle" && start) return { type: "rectangle", x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  if (state.tool === "circle" && start) return { type: "circle", cx: start.x, cy: start.y, r: distance(start, end) };
  if (state.tool === "ellipse" && start) return { type: "ellipse", cx: start.x, cy: start.y, rx: Math.abs(end.x - start.x), ry: Math.abs(end.y - start.y) };
  if (state.tool === "measure" && start) return { type: "dimension-preview", a: start, b: end };
  if (state.tool === "perpendicular" && start) {
    const target = perpendicularTarget(state.pointer, start);
    if (target) return { type: "line", x1: start.x, y1: start.y, x2: target.point.x, y2: target.point.y };
  }
  if (state.tool === "tangent" && start) return tangentPreview(state.pointer, start);
  if (state.tool === "secant" && start) return secantPreview(state.pointer, start);
  if (state.tool === "chord" && state.operation.circleId) {
    const circle = findShape(state.operation.circleId);
    if (!circle) return null;
    const point = nearestPointOnCircle(state.pointer, { x: circle.cx, y: circle.cy }, circle.r);
    return { type: "line", x1: state.operation.first.x, y1: state.operation.first.y, x2: point.x, y2: point.y, chordPoint: point };
  }
  return null;
}

function renderInteraction() {
  dom.layers.interaction.replaceChildren();
  if (state.marquee) {
    const box = selectionRect(state.marquee.start, state.marquee.current);
    dom.layers.interaction.append(svgElement("rect", {
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
      class: "selection-marquee"
    }));
  }
  const snap = state.currentSnap;
  if (snap?.type && (state.tool !== "select" || state.drag)) {
    const size = 7 / currentScale();
    const marker = snap.type === "center" || snap.type === "quadrant"
      ? svgElement("circle", { cx: snap.point.x, cy: snap.point.y, r: size / 2, class: "snap-marker" })
      : svgElement("rect", { x: snap.point.x - size / 2, y: snap.point.y - size / 2, width: size, height: size, class: "snap-marker" });
    dom.layers.interaction.append(marker);
    const screen = worldToClient(snap.point);
    dom.snapBadge.hidden = false;
    dom.snapBadge.textContent = `${SNAP_NAMES[snap.type] || snap.type}${state.candidates.length > 1 ? ` ${state.candidateIndex + 1}/${state.candidates.length}` : ""}`;
    dom.snapBadge.style.left = `${screen.x + 12}px`;
    dom.snapBadge.style.top = `${screen.y + 12}px`;
  } else {
    dom.snapBadge.hidden = true;
  }
  const hover = state.hoverAngle;
  if (hover && state.tool === "select" && !state.drag && !state.pan && !state.marquee) {
    dom.layers.interaction.append(svgElement("line", {
      x1: hover.a.x, y1: hover.a.y, x2: hover.b.x, y2: hover.b.y, class: "angle-hover-line"
    }));
    dom.angleBadge.hidden = false;
    dom.angleBadge.textContent = `มุม ${formatNumber(hover.angle)}° จากแนวนอน`;
    const screen = worldToClient(state.pointer);
    const padding = 8;
    const left = Math.min(screen.x + 14, Math.max(padding, dom.surface.clientWidth - dom.angleBadge.offsetWidth - padding));
    const top = Math.min(screen.y + 14, Math.max(padding, dom.surface.clientHeight - dom.angleBadge.offsetHeight - padding));
    dom.angleBadge.style.left = `${Math.max(padding, left)}px`;
    dom.angleBadge.style.top = `${Math.max(padding, top)}px`;
  } else {
    dom.angleBadge.hidden = true;
  }
  const preview = previewShape();
  if (!preview) return;
  if (preview.type === "dimension-preview") {
    dom.layers.interaction.append(svgElement("line", { x1: preview.a.x, y1: preview.a.y, x2: preview.b.x, y2: preview.b.y, class: "guide" }));
    const label = svgElement("text", { x: (preview.a.x + preview.b.x) / 2, y: (preview.a.y + preview.b.y) / 2 - 6 / currentScale(), class: "dimension-text", "font-size": 12 / currentScale(), "stroke-width": 4 / currentScale(), "text-anchor": "middle" });
    label.textContent = formatLength(distance(preview.a, preview.b));
    dom.layers.interaction.append(label);
    return;
  }
  if (preview.type === "tangent-preview") {
    preview.solutions.forEach((point, index) => {
      dom.layers.interaction.append(svgElement("line", { x1: preview.start.x, y1: preview.start.y, x2: point.x, y2: point.y, class: index === preview.selectedIndex ? "guide" : "guide tangent-alt" }));
    });
    return;
  }
  if (preview.type === "secant-preview") {
    dom.layers.interaction.append(svgElement("line", { x1: preview.a.x, y1: preview.a.y, x2: preview.b.x, y2: preview.b.y, class: "guide" }));
    preview.intersections.forEach(p => dom.layers.interaction.append(svgElement("circle", { cx: p.x, cy: p.y, r: 3.5 / currentScale(), class: "intersection-mark" })));
    return;
  }
  const node = shapeNode(preview, true);
  if (node) dom.layers.interaction.append(node);
}

function worldToClient(p) {
  const rect = dom.svg.getBoundingClientRect();
  const view = viewRect();
  return { x: ((p.x - view.x) / view.width) * rect.width, y: ((p.y - view.y) / view.height) * rect.height };
}

function perpendicularTarget(pointer, start) {
  let best = null;
  const threshold = 30 / currentScale();
  for (const shape of state.document.shapes) {
    for (const segment of shapeSegments(shape)) {
      const projected = projectPointToSegment(start, segment.a, segment.b);
      const d = distance(pointer, projected.point);
      if (d <= threshold && (!best || d < best.distance)) best = { ...segment, point: projected.point, distance: d };
    }
  }
  return best;
}

function circleTarget(pointer, thresholdPx = 36) {
  const threshold = thresholdPx / currentScale();
  let best = null;
  for (const shape of state.document.shapes) {
    if (shape.type !== "circle") continue;
    const radial = distance(pointer, { x: shape.cx, y: shape.cy });
    const edgeDistance = Math.abs(radial - shape.r);
    const inside = radial <= shape.r;
    if ((inside || edgeDistance <= threshold) && (!best || edgeDistance < best.score)) {
      best = { circle: shape, score: edgeDistance };
    }
  }
  return best?.circle || null;
}

function tangentPreview(pointer, start) {
  const circle = circleTarget(pointer);
  if (!circle) return null;
  const solutions = tangentPointsFromPoint(start, { x: circle.cx, y: circle.cy }, circle.r);
  if (!solutions.length) return { type: "tangent-preview", start, solutions: [], selectedIndex: 0, circle };
  let selectedIndex = 0;
  if (solutions.length > 1 && distance(pointer, solutions[1]) < distance(pointer, solutions[0])) selectedIndex = 1;
  return { type: "tangent-preview", start, solutions, selectedIndex, circle };
}

function secantPreview(pointer, start) {
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return null;
  const unit = { x: dx / length, y: dy / length };
  const far = { x: start.x + unit.x * 1000000, y: start.y + unit.y * 1000000 };
  let best = null;
  for (const circle of state.document.shapes.filter(shape => shape.type === "circle")) {
    const hits = lineCircleIntersections(start, far, { x: circle.cx, y: circle.cy }, circle.r, false);
    if (hits.length !== 2) continue;
    const lineDistance = Math.abs((circle.cx - start.x) * unit.y - (circle.cy - start.y) * unit.x);
    const centerAhead = (circle.cx - start.x) * unit.x + (circle.cy - start.y) * unit.y;
    if (centerAhead < -circle.r) continue;
    const score = lineDistance + Math.max(0, distance(pointer, { x: circle.cx, y: circle.cy }) - circle.r) * 0.03;
    if (!best || score < best.score) best = { circle, hits, score };
  }
  if (!best) return null;
  const ts = best.hits.map(hit => (hit.point.x - start.x) * unit.x + (hit.point.y - start.y) * unit.y);
  const margin = Math.max(best.circle.r * 0.18, 8 / currentScale());
  const aT = Math.min(0, ...ts) - margin;
  const bT = Math.max(length, ...ts) + margin;
  return {
    type: "secant-preview",
    circle: best.circle,
    a: { x: start.x + unit.x * aT, y: start.y + unit.y * aT },
    b: { x: start.x + unit.x * bT, y: start.y + unit.y * bT },
    intersections: best.hits.map(hit => hit.point)
  };
}

function hitTest(p) {
  const tolerance = 9 / currentScale();
  const all = [...state.document.dimensions, ...state.document.shapes].reverse();
  for (const entity of all) {
    if (entity.type === "line") {
      if (projectPointToSegment(p, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }).distance <= tolerance) return entity;
    } else if (entity.type === "rectangle") {
      const inside = p.x >= entity.x && p.x <= entity.x + entity.width && p.y >= entity.y && p.y <= entity.y + entity.height;
      if (inside || shapeSegments(entity).some(segment => projectPointToSegment(p, segment.a, segment.b).distance <= tolerance)) return entity;
    } else if (entity.type === "circle") {
      const radial = distance(p, { x: entity.cx, y: entity.cy });
      if (radial <= entity.r + tolerance) return entity;
    } else if (entity.type === "ellipse") {
      const normalized = ((p.x - entity.cx) / entity.rx) ** 2 + ((p.y - entity.cy) / entity.ry) ** 2;
      if (normalized <= 1.08) return entity;
    } else if (entity.type === "dimension") {
      const a = resolveRef(entity.a);
      const b = resolveRef(entity.b);
      if (a && b && projectPointToSegment(p, a, b).distance <= tolerance * 1.7) return entity;
    }
  }
  return null;
}

function lineEndpointTarget(p) {
  const tolerance = 10 / currentScale();
  let best = null;
  for (const line of [...state.document.shapes].reverse()) {
    if (line.type !== "line") continue;
    const endpoints = [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }];
    endpoints.forEach((point, endpoint) => {
      const d = distance(p, point);
      if (d > tolerance) return;
      const selectedRank = isSelected(line.id) ? 0 : 1;
      if (!best || selectedRank < best.selectedRank || (selectedRank === best.selectedRank && d < best.distance)) {
        best = { line, endpoint, point, distance: d, selectedRank };
      }
    });
  }
  return best;
}

function angleTarget(p) {
  const tolerance = 9 / currentScale();
  const entities = [...state.document.dimensions, ...state.document.shapes].reverse();
  let best = null;
  for (const entity of entities) {
    let segments = shapeSegments(entity);
    if (entity.type === "dimension") {
      const a = resolveRef(entity.a);
      const b = resolveRef(entity.b);
      segments = a && b ? [{ a, b, shapeId: entity.id, edge: 0 }] : [];
    }
    for (const segment of segments) {
      const projected = projectPointToSegment(p, segment.a, segment.b);
      if (projected.distance > tolerance || (best && projected.distance >= best.distance)) continue;
      const angle = segmentAngleDegrees(
        { x: segment.a.x, y: -segment.a.y },
        { x: segment.b.x, y: -segment.b.y }
      );
      if (angle !== null) best = { ...segment, angle, distance: projected.distance };
    }
  }
  return best;
}

function selectEntity(id) {
  setSelection(id ? [id] : []);
  state.operation = null;
  renderAll();
  const entity = findEntity(id);
  announce(entity ? `เลือก${TYPE_NAMES[entity.type]}` : "ยกเลิกการเลือก");
}

function selectedEntityIds() {
  return state.selectedIds.filter(id => Boolean(findEntity(id)));
}

function isSelected(id) {
  return state.selectedIds.includes(id);
}

function setSelection(ids) {
  state.selectedIds = [...new Set(ids)].filter(id => Boolean(findEntity(id)));
  state.selectedId = state.selectedIds.at(-1) || null;
}

function translateEntity(entity, dx, dy) {
  if (entity.type === "line") {
    entity.x1 += dx; entity.y1 += dy; entity.x2 += dx; entity.y2 += dy;
    if (entity.construction) delete entity.construction;
  } else if (entity.type === "rectangle") {
    entity.x += dx; entity.y += dy;
  } else if (entity.type === "circle" || entity.type === "ellipse") {
    entity.cx += dx; entity.cy += dy;
  } else if (entity.type === "dimension") {
    if (!entity.a.ref) { entity.a.point.x += dx; entity.a.point.y += dy; }
    if (!entity.b.ref) { entity.b.point.x += dx; entity.b.point.y += dy; }
  }
  refreshConstructions();
}

function commitEntity(entity, message) {
  pushHistory();
  if (entity.type === "dimension") state.document.dimensions.push(entity);
  else state.document.shapes.push(entity);
  setSelection([entity.id]);
  state.operation = null;
  state.currentSnap = null;
  state.hoverAngle = null;
  renderAll();
  scheduleAutosave();
  announce(message);
}

function beginOperation(candidate) {
  state.operation = { start: anchorFromCandidate(candidate) };
  announce("กำหนดจุดแรกแล้ว — เลือกจุดถัดไป");
}

function handleToolPoint(candidate) {
  const p = candidate.point;
  if (["line", "rectangle", "circle", "ellipse", "measure"].includes(state.tool)) {
    if (!state.operation) return beginOperation(candidate);
    const start = state.operation.start.point;
    if (state.tool === "line") {
      if (distance(start, p) < EPSILON) return announce("เส้นต้องมีความยาวมากกว่า 0");
      return commitEntity({ id: uid("line"), type: "line", x1: start.x, y1: start.y, x2: p.x, y2: p.y }, "สร้างเส้นตรงแล้ว");
    }
    if (state.tool === "rectangle") {
      const width = Math.abs(p.x - start.x); const height = Math.abs(p.y - start.y);
      if (width < EPSILON || height < EPSILON) return announce("สี่เหลี่ยมต้องมีความกว้างและความสูงมากกว่า 0");
      return commitEntity({ id: uid("rect"), type: "rectangle", x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width, height }, "สร้างสี่เหลี่ยมแล้ว");
    }
    if (state.tool === "circle") {
      const r = distance(start, p);
      if (r < EPSILON) return announce("รัศมีต้องมากกว่า 0");
      return commitEntity({ id: uid("circle"), type: "circle", cx: start.x, cy: start.y, r }, "สร้างวงกลมแล้ว");
    }
    if (state.tool === "ellipse") {
      const rx = Math.abs(p.x - start.x); const ry = Math.abs(p.y - start.y);
      if (rx < EPSILON || ry < EPSILON) return announce("วงรีต้องมีรัศมี X และ Y มากกว่า 0");
      return commitEntity({ id: uid("ellipse"), type: "ellipse", cx: start.x, cy: start.y, rx, ry }, "สร้างวงรีแล้ว");
    }
    if (state.tool === "measure") {
      if (distance(start, p) < EPSILON) return announce("จุดวัดต้องไม่ซ้ำกัน");
      return commitEntity({ id: uid("dim"), type: "dimension", a: state.operation.start, b: anchorFromCandidate(candidate) }, "เพิ่มระยะวัดแล้ว");
    }
  }
  if (state.tool === "perpendicular") {
    if (!state.operation) return beginOperation(candidate);
    const start = state.operation.start.point;
    const target = perpendicularTarget(state.pointer, start);
    if (!target || distance(start, target.point) < EPSILON) return announce("เลื่อนตัวชี้ใกล้ขอบที่ต้องการให้ตั้งฉาก");
    return commitEntity({ id: uid("perp"), type: "line", x1: start.x, y1: start.y, x2: target.point.x, y2: target.point.y, construction: { type: "perpendicular", edgeShapeId: target.shapeId, edge: target.edge } }, "สร้างเส้นตั้งฉากแล้ว");
  }
  if (state.tool === "tangent") {
    if (!state.operation) return beginOperation(candidate);
    const preview = tangentPreview(state.pointer, state.operation.start.point);
    if (!preview?.circle) return announce("คลิกภายในหรือใกล้วงกลมเป้าหมาย");
    if (!preview.solutions.length) return announce("จุดเริ่มอยู่ภายในวงกลม จึงสร้างเส้นสัมผัสไม่ได้");
    const end = preview.solutions[preview.selectedIndex];
    return commitEntity({
      id: uid("tangent"), type: "line",
      x1: preview.start.x, y1: preview.start.y, x2: end.x, y2: end.y,
      construction: { type: "tangent", circleId: preview.circle.id, external: { ...preview.start }, externalRef: clone(state.operation.start), solution: preview.selectedIndex }
    }, "สร้างเส้นสัมผัสแล้ว");
  }
  if (state.tool === "secant") {
    if (!state.operation) return beginOperation(candidate);
    const preview = secantPreview(state.pointer, state.operation.start.point);
    if (!preview) return announce("แนวที่เลือกยังไม่ตัดวงกลมสองจุด");
    return commitEntity({
      id: uid("secant"), type: "line",
      x1: preview.a.x, y1: preview.a.y, x2: preview.b.x, y2: preview.b.y,
      construction: { type: "secant", circleId: preview.circle.id, intersections: preview.intersections }
    }, "สร้างเส้นตัดวงกลมแล้ว");
  }
  if (state.tool === "chord") {
    if (!state.operation) {
      const circle = candidate.shapeType === "circle" ? findShape(candidate.shapeId) : circleTarget(state.pointer, 14);
      if (!circle) return announce("จุดแรกต้องอยู่บนขอบวงกลม");
      const first = nearestPointOnCircle(p, { x: circle.cx, y: circle.cy }, circle.r);
      state.operation = { circleId: circle.id, first, angle1: Math.atan2(first.y - circle.cy, first.x - circle.cx) };
      return announce("กำหนดปลายคอร์ดจุดแรกแล้ว");
    }
    const circle = findShape(state.operation.circleId);
    if (!circle) return cancelOperation("ไม่พบวงกลมอ้างอิง");
    const second = nearestPointOnCircle(p, { x: circle.cx, y: circle.cy }, circle.r);
    if (distance(state.operation.first, second) < EPSILON) return announce("ปลายคอร์ดต้องไม่ซ้ำกัน");
    return commitEntity({
      id: uid("chord"), type: "line",
      x1: state.operation.first.x, y1: state.operation.first.y, x2: second.x, y2: second.y,
      construction: { type: "chord", circleId: circle.id, angle1: state.operation.angle1, angle2: Math.atan2(second.y - circle.cy, second.x - circle.cx) }
    }, "สร้างคอร์ดแล้ว");
  }
}

function cancelOperation(message = "ยกเลิกคำสั่งแล้ว") {
  state.operation = null;
  state.currentSnap = null;
  state.candidates = [];
  state.hoverAngle = null;
  renderInteraction();
  announce(message);
}

function deleteSelected() {
  const ids = new Set(selectedEntityIds());
  if (!ids.size) return;
  const before = snapshot();
  const shapeIds = new Set(state.document.shapes.filter(shape => ids.has(shape.id)).map(shape => shape.id));
  for (const shape of state.document.shapes) {
    if (shape.construction?.circleId && shapeIds.has(shape.construction.circleId)) shapeIds.add(shape.id);
  }
  state.document.shapes = state.document.shapes.filter(shape => !shapeIds.has(shape.id));
  for (const shape of state.document.shapes) {
    if (shape.construction?.edgeShapeId && shapeIds.has(shape.construction.edgeShapeId)) delete shape.construction;
  }
  state.document.dimensions = state.document.dimensions.filter(item => !ids.has(item.id) && !shapeIds.has(item.a?.ref?.shapeId) && !shapeIds.has(item.b?.ref?.shapeId));
  setSelection([]);
  pushHistory(before);
  renderAll();
  scheduleAutosave();
  announce(`ลบ ${ids.size} วัตถุและความสัมพันธ์ที่เกี่ยวข้องแล้ว`);
}

function duplicateSelected() {
  const ids = selectedEntityIds();
  if (!ids.length) return;
  const before = snapshot();
  const selectedShapes = state.document.shapes.filter(shape => ids.includes(shape.id));
  const selectedDimensions = state.document.dimensions.filter(item => ids.includes(item.id));
  const idMap = new Map(selectedShapes.map(shape => [shape.id, uid(shape.type)]));
  const shapeCopies = selectedShapes.map(shape => {
    const copy = clone(shape);
    copy.id = idMap.get(shape.id);
    delete copy.construction;
    translateEntity(copy, 12, 12);
    return copy;
  });
  const dimensionCopies = selectedDimensions.map(item => {
    const copy = clone(item);
    copy.id = uid("dim");
    for (const key of ["a", "b"]) {
      const resolved = resolveRef(item[key]);
      const mappedShapeId = item[key].ref ? idMap.get(item[key].ref.shapeId) : null;
      copy[key] = {
        point: { x: resolved.x + 12, y: resolved.y + 12 },
        ...(mappedShapeId ? { ref: { ...item[key].ref, shapeId: mappedShapeId } } : {})
      };
    }
    return copy;
  });
  pushHistory(before);
  state.document.shapes.push(...shapeCopies);
  state.document.dimensions.push(...dimensionCopies);
  setSelection([...shapeCopies, ...dimensionCopies].map(entity => entity.id));
  renderAll();
  scheduleAutosave();
  announce(`ทำสำเนา ${ids.length} วัตถุแล้ว`);
}

function setTool(tool) {
  if (!TOOL_COPY[tool]) return;
  state.tool = tool;
  state.operation = null;
  state.currentSnap = null;
  state.candidates = [];
  state.hoverAngle = null;
  state.marquee = null;
  document.querySelectorAll("[data-tool]").forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const [name, hint] = TOOL_COPY[tool];
  dom.modeName.textContent = name;
  dom.modeHint.textContent = hint;
  dom.svg.style.cursor = tool === "select" ? "default" : "crosshair";
  renderInteraction();
  announce(hint);
}

function zoomAt(nextZoom, anchorClient = null) {
  const clamped = Math.max(0.08, Math.min(8, nextZoom));
  const rect = dom.svg.getBoundingClientRect();
  const anchor = anchorClient || { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  const before = clientToWorld(anchor);
  const rx = (anchor.clientX - rect.left) / Math.max(1, rect.width);
  const ry = (anchor.clientY - rect.top) / Math.max(1, rect.height);
  state.camera.zoom = clamped;
  const next = viewRect();
  state.camera.cx += before.x - (next.x + rx * next.width);
  state.camera.cy += before.y - (next.y + ry * next.height);
  renderScene();
}

function syncControls() {
  dom.unitSelect.value = state.document.unit;
  dom.gridSize.value = formatNumber(toDisplay(state.document.gridMm), Math.min(3, state.document.gridMm < 1 ? 3 : 0));
  dom.documentName.value = state.document.name;
  document.querySelectorAll("[data-snap]").forEach(input => { input.checked = Boolean(state.document.snapOptions[input.dataset.snap]); });
  dom.toggleAllSnaps.textContent = Object.values(state.document.snapOptions).every(Boolean) ? "ปิดทั้งหมด" : "เปิดทั้งหมด";
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(extension) {
  const base = state.document.name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "scalesketch";
  return `${base}.${extension}`;
}

function saveJson() {
  download(safeFilename("json"), new Blob([JSON.stringify(documentPayload(), null, 2)], { type: "application/json" }));
  announce("บันทึกไฟล์ JSON แล้ว");
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function shapeSvg(shape) {
  const common = `fill="none" stroke="#183d51" stroke-width="0.7"`;
  if (shape.type === "line") return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common}/>`;
  if (shape.type === "rectangle") return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ${common}/>`;
  if (shape.type === "circle") return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" ${common}/>`;
  if (shape.type === "ellipse") return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" ${common}/>`;
  return "";
}

function dimensionSvg(item) {
  const a = resolveRef(item.a);
  const b = resolveRef(item.b);
  if (!a || !b) return "";
  const length = distance(a, b);
  const safeLength = Math.max(length, EPSILON);
  const nx = -(b.y - a.y) / safeLength;
  const ny = (b.x - a.x) / safeLength;
  const offset = 8;
  const q1 = { x: a.x + nx * offset, y: a.y + ny * offset };
  const q2 = { x: b.x + nx * offset, y: b.y + ny * offset };
  const label = escapeXml(`${item.prefix || ""}${formatLength(length)}`);
  return `<g fill="none" stroke="#d77f34" stroke-width="0.45"><line x1="${a.x}" y1="${a.y}" x2="${q1.x}" y2="${q1.y}"/><line x1="${b.x}" y1="${b.y}" x2="${q2.x}" y2="${q2.y}"/><line x1="${q1.x}" y1="${q1.y}" x2="${q2.x}" y2="${q2.y}"/><text x="${(q1.x + q2.x) / 2}" y="${(q1.y + q2.y) / 2 - 2}" fill="#a8561c" stroke="none" text-anchor="middle" font-family="monospace" font-size="3.5">${label}</text></g>`;
}

function exportedSvg() {
  const bounds = documentBounds();
  const pad = Math.max(10, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.04);
  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const shapes = state.document.shapes.map(shapeSvg).join("\n  ");
  const dimensions = state.document.dimensions.map(dimensionSvg).join("\n  ");
  const scaleLength = Math.min(100, Math.max(10, width - pad * 2));
  const scaleBar = `<line x1="${x + pad}" y1="${y + height - pad / 2}" x2="${x + pad + scaleLength}" y2="${y + height - pad / 2}" stroke="#d77f34" stroke-width="1"/><text x="${x + pad + scaleLength / 2}" y="${y + height - pad / 2 - 3}" text-anchor="middle" font-family="sans-serif" font-size="4">${formatNumber(scaleLength, 0)} mm verification bar</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${x} ${y} ${width} ${height}">
  <title>${escapeXml(state.document.name)}</title>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>
  ${shapes}
  ${dimensions}
  ${scaleBar}
</svg>`;
}

function exportSvg() {
  download(safeFilename("svg"), new Blob([exportedSvg()], { type: "image/svg+xml" }));
  announce("ส่งออก SVG พร้อมแถบตรวจสอบ 100 mm แล้ว");
}

function exportPng() {
  const source = exportedSvg();
  const image = new Image();
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  image.onload = () => {
    const max = 2600;
    const scale = Math.min(4, max / Math.max(image.width || 1, image.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) download(safeFilename("png"), blob);
      URL.revokeObjectURL(url);
      announce("ส่งออก PNG แล้ว");
    }, "image/png");
  };
  image.onerror = () => { URL.revokeObjectURL(url); announce("ส่งออก PNG ไม่สำเร็จ"); };
  image.src = url;
}

function newDocument() {
  if ((state.document.shapes.length || state.document.dimensions.length) && !confirm("เริ่มเอกสารใหม่? งานปัจจุบันยังดาวน์โหลดเป็น JSON ได้จากปุ่มบันทึกไฟล์")) return;
  pushHistory();
  state.document = { ...createExampleDocument(), name: "แบบร่างใหม่", shapes: [], dimensions: [] };
  setSelection([]);
  syncControls();
  renderAll();
  scheduleAutosave();
  announce("สร้างเอกสารใหม่แล้ว");
}

function clearDocument() {
  if (!state.document.shapes.length && !state.document.dimensions.length) return;
  if (!confirm("ล้างวัตถุทั้งหมดในพื้นที่วาด? สามารถย้อนกลับได้")) return;
  pushHistory();
  state.document.shapes = [];
  state.document.dimensions = [];
  setSelection([]);
  renderAll();
  scheduleAutosave();
  announce("ล้างพื้นที่วาดแล้ว — กด Undo เพื่อคืนค่าได้");
}

async function openProject(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const next = validateProject(parsed);
    pushHistory();
    state.document = next;
    setSelection([]);
    refreshConstructions();
    syncControls();
    renderAll();
    fitView();
    scheduleAutosave();
    announce("เปิดไฟล์โครงการแล้ว");
  } catch (error) {
    announce(`เปิดไฟล์ไม่ได้: ${error.message}`);
  } finally {
    dom.fileInput.value = "";
  }
}

function handleMenuAction(action) {
  dom.moreMenu.hidden = true;
  dom.moreButton.setAttribute("aria-expanded", "false");
  if (action === "new") newDocument();
  if (action === "open") dom.fileInput.click();
  if (action === "export-svg") exportSvg();
  if (action === "export-png") exportPng();
  if (action === "clear") clearDocument();
  if (action === "help") dom.helpDialog.showModal();
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = tool => {
    try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Unsupported preview host. */ }
  };
  register({
    name: "list_geometry",
    title: "List geometry",
    description: "Read the current ScaleSketch shapes and measurements without changing the drawing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() { return { unit: state.document.unit, shapes: clone(state.document.shapes), dimensions: clone(state.document.dimensions) }; }
  });
  register({
    name: "add_geometry_shape",
    title: "Add geometry shape",
    description: "Add one line, rectangle, circle, or ellipse using millimeter model coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["line", "rectangle", "circle", "ellipse"] },
        x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
        x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" },
        cx: { type: "number" }, cy: { type: "number" }, radius: { type: "number" }, rx: { type: "number" }, ry: { type: "number" }
      },
      required: ["type"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      let shape;
      if (input.type === "line" && [input.x1, input.y1, input.x2, input.y2].every(Number.isFinite)) shape = { id: uid("line"), type: "line", x1: input.x1, y1: input.y1, x2: input.x2, y2: input.y2 };
      if (input.type === "rectangle" && [input.x, input.y, input.width, input.height].every(Number.isFinite) && input.width > 0 && input.height > 0) shape = { id: uid("rect"), type: "rectangle", x: input.x, y: input.y, width: input.width, height: input.height };
      if (input.type === "circle" && [input.cx, input.cy, input.radius].every(Number.isFinite) && input.radius > 0) shape = { id: uid("circle"), type: "circle", cx: input.cx, cy: input.cy, r: input.radius };
      if (input.type === "ellipse" && [input.cx, input.cy, input.rx, input.ry].every(Number.isFinite) && input.rx > 0 && input.ry > 0) shape = { id: uid("ellipse"), type: "ellipse", cx: input.cx, cy: input.cy, rx: input.rx, ry: input.ry };
      if (!shape) throw new Error("Shape parameters are incomplete or invalid.");
      commitEntity(shape, `เพิ่ม${TYPE_NAMES[shape.type]}แล้ว`);
      return { id: shape.id, type: shape.type, unit: "mm" };
    }
  });
}

function wireEvents() {
  document.querySelectorAll("[data-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.tool)));
  document.querySelector("#zoomIn").addEventListener("click", () => zoomAt(state.camera.zoom * 1.25));
  document.querySelector("#zoomOut").addEventListener("click", () => zoomAt(state.camera.zoom / 1.25));
  document.querySelector("#fitView").addEventListener("click", fitView);
  document.querySelector("#inspectorToggle").addEventListener("click", () => {
    setInspectorOpen(!document.querySelector(".inspector").classList.contains("open"));
  });
  compactInspectorQuery.addEventListener("change", syncInspectorMode);
  const syncResponsiveLayout = () => {
    syncAppViewportBounds();
    syncInspectorMode();
  };
  window.addEventListener("resize", syncResponsiveLayout);
  window.visualViewport?.addEventListener("resize", syncResponsiveLayout);
  syncAppViewportBounds();
  syncInspectorMode();
  dom.undo.addEventListener("click", undo);
  dom.redo.addEventListener("click", redo);
  document.querySelector("#saveBtn").addEventListener("click", saveJson);
  dom.moreButton.addEventListener("click", () => {
    dom.moreMenu.hidden = !dom.moreMenu.hidden;
    dom.moreButton.setAttribute("aria-expanded", String(!dom.moreMenu.hidden));
  });
  dom.moreMenu.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action) handleMenuAction(action);
  });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".menu-anchor")) {
      dom.moreMenu.hidden = true;
      dom.moreButton.setAttribute("aria-expanded", "false");
    }
  });
  dom.fileInput.addEventListener("change", () => { if (dom.fileInput.files[0]) openProject(dom.fileInput.files[0]); });
  dom.unitSelect.addEventListener("change", event => {
    const previousFactor = UNIT_FACTORS[state.document.unit];
    const nextFactor = UNIT_FACTORS[event.target.value];
    const pendingCoordinates = [dom.exactX, dom.exactY].map(input => {
      if (input.value.trim() === "") return null;
      const value = Number(input.value);
      return Number.isFinite(value) ? value * previousFactor : null;
    });
    state.document.unit = event.target.value;
    syncControls();
    [dom.exactX, dom.exactY].forEach((input, index) => {
      if (pendingCoordinates[index] !== null) input.value = formatNumber(pendingCoordinates[index] / nextFactor, 6);
    });
    renderAll();
    scheduleAutosave();
    announce(`เปลี่ยนหน่วยเป็น ${state.document.unit}`);
  });
  dom.gridSize.addEventListener("change", event => {
    const displayValue = Number(event.target.value);
    if (!Number.isFinite(displayValue) || displayValue <= 0) {
      syncControls();
      return announce("ขนาดกริดต้องมากกว่า 0");
    }
    state.document.gridMm = fromDisplay(displayValue);
    renderScene();
    scheduleAutosave();
    announce(`กริด ${formatLength(state.document.gridMm)}`);
  });
  dom.documentName.addEventListener("input", event => {
    state.document.name = event.target.value.slice(0, 80);
    scheduleAutosave();
  });
  document.querySelectorAll("[data-snap]").forEach(input => input.addEventListener("change", () => {
    state.document.snapOptions[input.dataset.snap] = input.checked;
    scheduleAutosave();
    announce(`${input.checked ? "เปิด" : "ปิด"} Snap ${input.parentElement.textContent.trim()}`);
  }));
  dom.toggleAllSnaps.addEventListener("click", () => {
    const allOn = Object.values(state.document.snapOptions).every(Boolean);
    Object.keys(state.document.snapOptions).forEach(key => { state.document.snapOptions[key] = !allOn; });
    syncControls();
    scheduleAutosave();
    announce(allOn ? "ปิด Snap ทั้งหมดแล้ว" : "เปิด Snap ทั้งหมดแล้ว");
  });
  document.querySelectorAll("[data-tab]").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(item => { const active = item === tab; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-tab-panel]").forEach(panel => { panel.hidden = panel.dataset.tabPanel !== tab.dataset.tab; });
  }));
  document.querySelector("#coordinateForm").addEventListener("submit", event => {
    event.preventDefault();
    const x = fromDisplay(Number(dom.exactX.value));
    const y = fromDisplay(Number(dom.exactY.value));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return announce("พิกัด X และ Y ต้องเป็นตัวเลข");
    state.pointer = { x, y };
    // Explicit numeric coordinates are authoritative and must not be shifted
    // to a nearby grid or object by the screen-space snap tolerance.
    state.currentSnap = { point: { x, y }, type: null, shapeId: null };
    state.candidates = [];
    handleToolPoint(state.currentSnap);
    renderInteraction();
    dom.svg.focus();
  });
  dom.svg.addEventListener("pointerdown", event => {
    const p = clientToWorld(event);
    state.pointer = p;
    if (event.button === 1 || state.spaceDown) {
      state.pan = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, camera: { ...state.camera } };
      dom.svg.setPointerCapture(event.pointerId);
      dom.svg.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (state.tool === "select") {
      const endpoint = lineEndpointTarget(p);
      if (endpoint) {
        if (selectedEntityIds().length !== 1 || state.selectedId !== endpoint.line.id) setSelection([endpoint.line.id]);
        state.hoverAngle = null;
        state.drag = {
          kind: "endpoint",
          id: endpoint.line.id,
          endpoint: endpoint.endpoint,
          pointerId: event.pointerId,
          start: p,
          original: clone(endpoint.line),
          before: snapshot(),
          moved: false
        };
        dom.svg.setPointerCapture(event.pointerId);
        dom.svg.style.cursor = "crosshair";
        renderAll();
        return;
      }
      const entity = hitTest(p);
      state.hoverAngle = null;
      if (entity) {
        if (!isSelected(entity.id)) setSelection([entity.id]);
        const ids = selectedEntityIds();
        state.drag = {
          kind: "translate",
          ids,
          pointerId: event.pointerId,
          start: p,
          originals: ids.map(id => ({ id, entity: clone(findEntity(id)) })),
          before: snapshot(),
          moved: false
        };
        dom.svg.setPointerCapture(event.pointerId);
      } else {
        setSelection([]);
        state.marquee = { pointerId: event.pointerId, start: p, current: p };
        dom.svg.setPointerCapture(event.pointerId);
      }
      renderAll();
      return;
    }
    updateSnap(p);
    handleToolPoint(state.currentSnap);
    renderInteraction();
  });
  dom.svg.addEventListener("pointermove", event => {
    if (state.pan) {
      const dx = (event.clientX - state.pan.clientX) / currentScale();
      const dy = (event.clientY - state.pan.clientY) / currentScale();
      state.camera.cx = state.pan.camera.cx - dx;
      state.camera.cy = state.pan.camera.cy - dy;
      renderScene();
      return;
    }
    const p = clientToWorld(event);
    state.pointer = p;
    if (state.drag) {
      if (state.drag.kind === "endpoint") {
        updateSnap(p);
        const line = findShape(state.drag.id);
        if (!line || line.type !== "line") return;
        Object.assign(line, clone(state.drag.original));
        const target = state.currentSnap.point;
        const originalPoint = state.drag.endpoint === 0
          ? { x: state.drag.original.x1, y: state.drag.original.y1 }
          : { x: state.drag.original.x2, y: state.drag.original.y2 };
        state.drag.moved = distance(originalPoint, target) > 1 / currentScale();
        if (state.drag.endpoint === 0) {
          line.x1 = target.x;
          line.y1 = target.y;
        } else {
          line.x2 = target.x;
          line.y2 = target.y;
        }
        if (line.construction) delete line.construction;
        refreshConstructions();
        renderAll();
        return;
      }
      updateSnap(p);
      const target = state.currentSnap.point;
      const dx = target.x - state.drag.start.x;
      const dy = target.y - state.drag.start.y;
      if (Math.hypot(dx, dy) > 1 / currentScale()) state.drag.moved = true;
      for (const original of state.drag.originals) {
        const entity = findEntity(original.id);
        if (entity) Object.assign(entity, clone(original.entity));
      }
      for (const id of state.drag.ids) {
        const entity = findEntity(id);
        if (entity) translateEntity(entity, dx, dy);
      }
      refreshConstructions();
      renderAll();
      return;
    }
    if (state.marquee) {
      state.marquee.current = p;
      renderInteraction();
      return;
    }
    state.hoverAngle = state.tool === "select" ? angleTarget(p) : null;
    updateSnap(p);
    // Keep the X/Y pair stable while the user moves between fields or presses
    // the submit button. Updating only the inactive field can silently mix a
    // typed coordinate with the live cursor position.
    if (!document.querySelector("#coordinateForm").contains(document.activeElement)) {
      dom.exactX.value = formatNumber(toDisplay(state.currentSnap.point.x));
      dom.exactY.value = formatNumber(toDisplay(state.currentSnap.point.y));
    }
    dom.cursorPosition.innerHTML = `X ${formatNumber(toDisplay(state.currentSnap.point.x))} ${state.document.unit}&nbsp;&nbsp; Y ${formatNumber(toDisplay(state.currentSnap.point.y))} ${state.document.unit}`;
    renderInteraction();
  });
  dom.svg.addEventListener("pointerleave", () => {
    if (state.drag || state.pan) return;
    state.hoverAngle = null;
    renderInteraction();
  });
  const endPointer = event => {
    if (state.pan) {
      state.pan = null;
      dom.svg.style.cursor = state.tool === "select" ? "default" : "crosshair";
      if (dom.svg.hasPointerCapture(event.pointerId)) dom.svg.releasePointerCapture(event.pointerId);
    }
    if (state.drag) {
      const endpointDrag = state.drag.kind === "endpoint";
      const line = endpointDrag ? findShape(state.drag.id) : null;
      if (endpointDrag && (!state.drag.moved || !line || distance({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }) < EPSILON)) {
        if (line) Object.assign(line, clone(state.drag.original));
        if (state.drag.moved) announce("ปลายเส้นต้องไม่ซ้ำกัน");
        state.drag.moved = false;
        refreshConstructions();
      }
      if (state.drag.moved) {
        state.history.push(state.drag.before);
        if (state.history.length > MAX_HISTORY) state.history.shift();
        state.future = [];
        scheduleAutosave();
        announce(endpointDrag ? "ปรับตำแหน่งปลายเส้นแล้ว" : `ย้าย ${state.drag.ids.length} วัตถุแล้ว`);
      }
      state.drag = null;
      state.currentSnap = null;
      state.candidates = [];
      dom.svg.style.cursor = state.tool === "select" ? "default" : "crosshair";
      updateHistoryButtons();
      renderAll();
      if (dom.svg.hasPointerCapture(event.pointerId)) dom.svg.releasePointerCapture(event.pointerId);
    }
    if (state.marquee) {
      const ids = entitiesInsideSelection(state.marquee.start, state.marquee.current);
      state.marquee = null;
      setSelection(ids);
      renderAll();
      announce(ids.length ? `เลือก ${ids.length} วัตถุแล้ว` : "ไม่พบวัตถุในกรอบเลือก");
      if (dom.svg.hasPointerCapture(event.pointerId)) dom.svg.releasePointerCapture(event.pointerId);
    }
  };
  dom.svg.addEventListener("pointerup", endPointer);
  dom.svg.addEventListener("pointercancel", endPointer);
  dom.svg.addEventListener("wheel", event => {
    event.preventDefault();
    zoomAt(state.camera.zoom * Math.exp(-event.deltaY * 0.0015), event);
  }, { passive: false });
  window.addEventListener("keydown", event => {
    const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (event.key === "Escape" && isCompactViewport() && document.querySelector(".inspector").classList.contains("open")) {
      event.preventDefault();
      setInspectorOpen(false);
      if (!editing && state.tool !== "select") setTool("select");
      return;
    }
    if (event.code === "Space" && !editing) { state.spaceDown = true; dom.svg.style.cursor = "grab"; event.preventDefault(); }
    if (editing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (state.tool !== "select") setTool("select");
      else cancelOperation();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedEntityIds().length) { event.preventDefault(); deleteSelected(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    if (event.key === "Tab" && state.operation && state.candidates.length > 1 && document.activeElement === dom.svg) {
      event.preventDefault();
      state.candidateIndex += event.shiftKey ? -1 : 1;
      updateSnap(state.pointer, true);
      renderInteraction();
      announce(`Snap ${SNAP_NAMES[state.currentSnap.type]} ${state.candidateIndex + 1} จาก ${state.candidates.length}`);
    }
    const shortcuts = { v: "select", l: "line", r: "rectangle", c: "circle", e: "ellipse", m: "measure", p: "perpendicular", t: "tangent", s: "secant", h: "chord" };
    if (!event.ctrlKey && !event.metaKey && shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  });
  window.addEventListener("keyup", event => {
    if (event.code === "Space") { state.spaceDown = false; dom.svg.style.cursor = state.tool === "select" ? "default" : "crosshair"; }
  });
  new ResizeObserver(() => renderScene()).observe(dom.surface);
}

function initialize() {
  const recovered = loadAutosave();
  refreshConstructions();
  syncControls();
  wireEvents();
  renderAll();
  requestAnimationFrame(() => { fitView(); });
  registerWebMcpTools();
  state.initialized = true;
  announce(recovered ? "กู้คืนแบบร่างที่บันทึกในเครื่องแล้ว" : "พร้อมวาด — เลือกเครื่องมือทางซ้าย");
}

initialize();

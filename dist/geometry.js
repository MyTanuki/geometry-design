export const EPSILON = 1e-9;

export function point(x, y) { return { x, y }; }
export function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
export function midpoint(a, b) { return point((a.x + b.x) / 2, (a.y + b.y) / 2); }
export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function segmentAngleDegrees(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < EPSILON) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const normalized = ((angle % 180) + 180) % 180;
  return Math.abs(normalized - 180) < EPSILON ? 0 : normalized;
}

export function projectPointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return { point: { ...a }, t: 0, distance: distance(p, a) };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  const projected = point(a.x + t * dx, a.y + t * dy);
  return { point: projected, t, distance: distance(p, projected) };
}

export function lineLineIntersection(a1, a2, b1, b2, segments = true) {
  const r = point(a2.x - a1.x, a2.y - a1.y);
  const s = point(b2.x - b1.x, b2.y - b1.y);
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < EPSILON) return null;
  const qmp = point(b1.x - a1.x, b1.y - a1.y);
  const t = (qmp.x * s.y - qmp.y * s.x) / denominator;
  const u = (qmp.x * r.y - qmp.y * r.x) / denominator;
  if (segments && (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON)) return null;
  return { point: point(a1.x + t * r.x, a1.y + t * r.y), t, u };
}

export function lineCircleIntersections(a, b, center, radius, segment = false) {
  const d = point(b.x - a.x, b.y - a.y);
  const f = point(a.x - center.x, a.y - center.y);
  const A = d.x * d.x + d.y * d.y;
  if (A < EPSILON) return [];
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - radius * radius;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const values = discriminant <= EPSILON ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return values
    .filter(t => !segment || (t >= -EPSILON && t <= 1 + EPSILON))
    .map(t => ({ point: point(a.x + t * d.x, a.y + t * d.y), t }));
}

export function tangentPointsFromPoint(external, center, radius) {
  const dx = external.x - center.x;
  const dy = external.y - center.y;
  const d2 = dx * dx + dy * dy;
  const r2 = radius * radius;
  if (d2 < r2 - EPSILON) return [];
  if (Math.abs(d2 - r2) <= EPSILON) return [{ ...external }];
  const base = r2 / d2;
  const factor = radius * Math.sqrt(d2 - r2) / d2;
  return [
    point(center.x + base * dx - factor * dy, center.y + base * dy + factor * dx),
    point(center.x + base * dx + factor * dy, center.y + base * dy - factor * dx)
  ];
}

export function circleCircleIntersections(c1, r1, c2, r2) {
  const d = distance(c1, c2);
  if (d < EPSILON || d > r1 + r2 + EPSILON || d < Math.abs(r1 - r2) - EPSILON) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const x = c1.x + a * (c2.x - c1.x) / d;
  const y = c1.y + a * (c2.y - c1.y) / d;
  if (h < EPSILON) return [point(x, y)];
  const rx = -(c2.y - c1.y) * h / d;
  const ry = (c2.x - c1.x) * h / d;
  return [point(x + rx, y + ry), point(x - rx, y - ry)];
}

export function nearestPointOnCircle(p, center, radius) {
  const d = distance(p, center);
  if (d < EPSILON) return point(center.x + radius, center.y);
  return point(center.x + (p.x - center.x) * radius / d, center.y + (p.y - center.y) * radius / d);
}

export function nearestPointOnEllipse(p, center, rx, ry, rotation = 0) {
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const local = point(dx * cos - dy * sin, dx * sin + dy * cos);
  let angle = Math.atan2(local.y * rx, local.x * ry);
  for (let i = 0; i < 8; i += 1) {
    const ex = rx * Math.cos(angle);
    const ey = ry * Math.sin(angle);
    const qx = -rx * Math.sin(angle);
    const qy = ry * Math.cos(angle);
    const rx2 = -rx * Math.cos(angle);
    const ry2 = -ry * Math.sin(angle);
    const f = (ex - local.x) * qx + (ey - local.y) * qy;
    const fp = qx * qx + qy * qy + (ex - local.x) * rx2 + (ey - local.y) * ry2;
    if (Math.abs(fp) < EPSILON) break;
    angle -= f / fp;
  }
  const ex = rx * Math.cos(angle);
  const ey = ry * Math.sin(angle);
  const backCos = Math.cos(rotation);
  const backSin = Math.sin(rotation);
  return point(center.x + ex * backCos - ey * backSin, center.y + ex * backSin + ey * backCos);
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function pointToInfiniteLineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return distance(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

export function worldToScreen(p, view) {
  if (!(view.scale > 0) || !Number.isFinite(view.scale)) throw new Error("View scale must be a positive finite number.");
  return point((p.x - view.x) * view.scale, (p.y - view.y) * view.scale);
}

export function screenToWorld(p, view) {
  if (!(view.scale > 0) || !Number.isFinite(view.scale)) throw new Error("View scale must be a positive finite number.");
  return point(view.x + p.x / view.scale, view.y + p.y / view.scale);
}

export function rectangleMetrics(width, height) {
  if (!(width >= 0) || !(height >= 0) || !Number.isFinite(width + height)) throw new Error("Rectangle dimensions must be finite and non-negative.");
  return { area: width * height, perimeter: 2 * (width + height) };
}

export function circleMetrics(radius) {
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("Circle radius must be finite and non-negative.");
  return { area: Math.PI * radius * radius, circumference: 2 * Math.PI * radius };
}

export function ellipseMetrics(rx, ry) {
  if (!(rx >= 0) || !(ry >= 0) || !Number.isFinite(rx + ry)) throw new Error("Ellipse radii must be finite and non-negative.");
  const area = Math.PI * rx * ry;
  if (rx + ry < EPSILON) return { area, perimeter: 0 };
  const h = ((rx - ry) ** 2) / ((rx + ry) ** 2);
  const perimeter = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  return { area, perimeter };
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  EPSILON,
  circleCircleIntersections,
  circleMetrics,
  distance,
  dot,
  ellipseMetrics,
  lineCircleIntersections,
  lineLineIntersection,
  midpoint,
  nearestPointOnCircle,
  nearestPointOnEllipse,
  pointToInfiniteLineDistance,
  projectPointToSegment,
  rectangleMetrics,
  screenToWorld,
  segmentAngleDegrees,
  tangentPointsFromPoint,
  worldToScreen
} from "../dist/geometry.js";

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function pointClose(actual, expected, tolerance = 1e-9) {
  close(actual.x, expected.x, tolerance);
  close(actual.y, expected.y, tolerance);
}

test("GEO-01 distance and midpoint are exact for a 3-4-5 triangle", () => {
  close(distance({ x: 0, y: 0 }, { x: 300, y: 400 }), 500);
  close(distance({ x: 300, y: 400 }, { x: 0, y: 0 }), 500);
  close(distance({ x: 2, y: -8 }, { x: 2, y: -8 }), 0);
  pointClose(midpoint({ x: 0, y: 0 }, { x: 10, y: 4 }), { x: 5, y: 2 });
});

test("GEO-02 projection onto a segment returns foot, t, and distance", () => {
  const projected = projectPointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  pointClose(projected.point, { x: 3, y: 0 });
  close(projected.t, 0.3);
  close(projected.distance, 4);
  close(dot({ x: 3, y: 4 }, { x: 10, y: 0 }), 30);
});

test("GEO-03 projection clamps outside points and handles zero-length segments", () => {
  pointClose(projectPointToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point, { x: 0, y: 0 });
  pointClose(projectPointToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point, { x: 10, y: 0 });
  const degenerate = projectPointToSegment({ x: 4, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 });
  pointClose(degenerate.point, { x: 1, y: 1 });
  close(degenerate.distance, 5);
});

test("GEO-04 line intersection handles crossing, parallel, and out-of-segment lines", () => {
  const hit = lineLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
  pointClose(hit.point, { x: 5, y: 0 });
  assert.equal(lineLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }), null);
  assert.equal(lineLineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }), null);
  assert.equal(lineLineIntersection({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }), null);
});

test("GEO-05 segment inclination is undirected and normalized to 0–180 degrees", () => {
  close(segmentAngleDegrees({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  close(segmentAngleDegrees({ x: 10, y: 0 }, { x: 0, y: 0 }), 0);
  close(segmentAngleDegrees({ x: 0, y: 0 }, { x: 0, y: 10 }), 90);
  close(segmentAngleDegrees({ x: 0, y: 0 }, { x: 10, y: 10 }), 45);
  close(segmentAngleDegrees({ x: 0, y: 0 }, { x: 10, y: -10 }), 135);
  assert.equal(segmentAngleDegrees({ x: 2, y: 3 }, { x: 2, y: 3 }), null);
});

test("GEO-06 line-circle intersection returns two, one, or zero unique points", () => {
  const two = lineCircleIntersections({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5, false);
  assert.equal(two.length, 2);
  pointClose(two[0].point, { x: -5, y: 0 });
  pointClose(two[1].point, { x: 5, y: 0 });
  const tangent = lineCircleIntersections({ x: -10, y: 5 }, { x: 10, y: 5 }, { x: 0, y: 0 }, 5, false);
  assert.equal(tangent.length, 1);
  pointClose(tangent[0].point, { x: 0, y: 5 });
  assert.equal(lineCircleIntersections({ x: -10, y: 6 }, { x: 10, y: 6 }, { x: 0, y: 0 }, 5, false).length, 0);
});

test("GEO-08 shape metrics match analytical values", () => {
  assert.deepEqual(rectangleMetrics(30, 40), { area: 1200, perimeter: 140 });
  close(circleMetrics(10).area, 100 * Math.PI);
  close(circleMetrics(10).circumference, 20 * Math.PI);
  close(ellipseMetrics(10, 10).area, 100 * Math.PI);
  close(ellipseMetrics(10, 10).perimeter, 20 * Math.PI);
  assert.throws(() => rectangleMetrics(-1, 4));
  assert.throws(() => circleMetrics(Number.POSITIVE_INFINITY));
});

test("GEO-09 world-screen transform round-trips over zoom and large pan", () => {
  for (const scale of [0.25, 1, 4, 13.37]) {
    for (const origin of [{ x: 0, y: 0 }, { x: 10000, y: -10000 }]) {
      const view = { ...origin, scale };
      const source = { x: origin.x + 123.456789, y: origin.y - 987.654321 };
      pointClose(screenToWorld(worldToScreen(source, view), view), source, 2e-12);
    }
  }
  assert.throws(() => worldToScreen({ x: 0, y: 0 }, { x: 0, y: 0, scale: 0 }));
});

test("CIR-01 tangent from (13,0) to radius-5 circle has two exact solutions", () => {
  const external = { x: 13, y: 0 };
  const center = { x: 0, y: 0 };
  const solutions = tangentPointsFromPoint(external, center, 5);
  assert.equal(solutions.length, 2);
  const expectedY = 60 / 13;
  for (const p of solutions) {
    close(p.x, 25 / 13);
    close(Math.abs(p.y), expectedY);
    close(distance(center, p), 5);
    close(pointToInfiniteLineDistance(center, external, p), 5);
    close(dot({ x: p.x, y: p.y }, { x: external.x - p.x, y: external.y - p.y }), 0, 1e-8);
  }
});

test("CIR-02 tangent boundary cases return one or zero solutions without NaN", () => {
  const center = { x: 0, y: 0 };
  assert.equal(tangentPointsFromPoint({ x: 5, y: 0 }, center, 5).length, 1);
  assert.equal(tangentPointsFromPoint({ x: 4, y: 0 }, center, 5).length, 0);
  assert.equal(tangentPointsFromPoint(center, center, 5).length, 0);
});

test("CIR-03 circle-circle intersections cover two, tangent, and disjoint cases", () => {
  const two = circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  assert.equal(two.length, 2);
  for (const p of two) {
    close(distance(p, { x: 0, y: 0 }), 5);
    close(distance(p, { x: 8, y: 0 }), 5);
  }
  assert.equal(circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 10, y: 0 }, 5).length, 1);
  assert.equal(circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 11, y: 0 }, 5).length, 0);
});

test("CIR-04 a quarter-circle chord has length 5√2 and exact membership", () => {
  const center = { x: 0, y: 0 };
  const a = nearestPointOnCircle({ x: 8, y: 0 }, center, 5);
  const b = nearestPointOnCircle({ x: 0, y: 9 }, center, 5);
  pointClose(a, { x: 5, y: 0 });
  pointClose(b, { x: 0, y: 5 });
  close(distance(a, b), 5 * Math.SQRT2);
});

test("ellipse nearest-point solver returns a point on the ellipse", () => {
  const p = nearestPointOnEllipse({ x: 18, y: 7 }, { x: 2, y: -3 }, 10, 5);
  const normalized = ((p.x - 2) / 10) ** 2 + ((p.y + 3) / 5) ** 2;
  close(normalized, 1, 1e-8);
});

test("large and very small finite coordinates do not produce NaN", () => {
  for (const magnitude of [1e-9, 1e9]) {
    const p = projectPointToSegment({ x: magnitude, y: magnitude }, { x: 0, y: 0 }, { x: magnitude * 2, y: 0 });
    assert.ok(Number.isFinite(p.point.x));
    assert.ok(Number.isFinite(p.point.y));
    assert.ok(Number.isFinite(p.distance));
  }
  assert.ok(EPSILON > 0);
});

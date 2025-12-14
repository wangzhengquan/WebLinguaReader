import { describe, it, expect } from 'vitest';
import { DOMRectUtils } from './DOMRectUtils';

describe('DOMRectUtils', () => {
  it('should calculate the union of two overlapping rectangles', () => {
    const rect1 = new DOMRect(10, 10, 100, 100);
    const rect2 = new DOMRect(50, 50, 100, 100);

    // Union should be from (10, 10) to (150, 150)
    // x: 10, y: 10
    // width: 150 - 10 = 140
    // height: 150 - 10 = 140

    const union = DOMRectUtils.union(rect1, rect2);

    expect(union.x).toBe(10);
    expect(union.y).toBe(10);
    expect(union.width).toBe(140);
    expect(union.height).toBe(140);
    expect(union.right).toBe(150);
    expect(union.bottom).toBe(150);
  });

  it('should calculate the union of two non-overlapping rectangles', () => {
    const rect1 = new DOMRect(0, 0, 10, 10);
    const rect2 = new DOMRect(20, 20, 10, 10);

    // Union should be from (0, 0) to (30, 30)
    // x: 0, y: 0
    // width: 30 - 0 = 30
    // height: 30 - 0 = 30

    const union = DOMRectUtils.union(rect1, rect2);

    expect(union.x).toBe(0);
    expect(union.y).toBe(0);
    expect(union.width).toBe(30);
    expect(union.height).toBe(30);
  });

  it('should handle one rectangle inside another', () => {
    const outer = new DOMRect(0, 0, 100, 100);
    const inner = new DOMRect(25, 25, 50, 50);

    const union = DOMRectUtils.union(outer, inner);

    expect(union.x).toBe(0);
    expect(union.y).toBe(0);
    expect(union.width).toBe(100);
    expect(union.height).toBe(100);
  });

  it('should correctly identify intersecting rectangles', () => {
    const rect1 = new DOMRect(0, 0, 100, 100);
    const rect2 = new DOMRect(50, 50, 100, 100);
    expect(DOMRectUtils.isIntersect(rect1, rect2)).toBe(true);
  });

  it('should correctly identify non-intersecting rectangles', () => {
    const rect1 = new DOMRect(0, 0, 10, 10);
    const rect2 = new DOMRect(20, 20, 10, 10);
    expect(DOMRectUtils.isIntersect(rect1, rect2)).toBe(false);
  });

  it('should identify one rectangle inside another as intersecting', () => {
    const outer = new DOMRect(0, 0, 100, 100);
    const inner = new DOMRect(25, 25, 50, 50);
    expect(DOMRectUtils.isIntersect(outer, inner)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import DOMRectUtils from './DOMRectUtils';

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

  it('should correctly identify if one rectangle contains another', () => {
    const outer = new DOMRect(0, 0, 100, 100);
    const inner = new DOMRect(25, 25, 50, 50);
    expect(DOMRectUtils.contains(outer, inner)).toBe(true);
  });

  it('should correctly identify if one rectangle does not contain another', () => {
    const rect1 = new DOMRect(0, 0, 100, 100);
    const rect2 = new DOMRect(50, 50, 100, 100); // Overlapping but not contained
    expect(DOMRectUtils.contains(rect1, rect2)).toBe(false);

    const rect3 = new DOMRect(200, 200, 50, 50); // Completely outside
    expect(DOMRectUtils.contains(rect1, rect3)).toBe(false);
  });

  it('should consider a rectangle to contain itself', () => {
    const rect = new DOMRect(0, 0, 100, 100);
    expect(DOMRectUtils.contains(rect, rect)).toBe(true);
  });

  it('should generate consistent hash codes', () => {
    const rect1 = new DOMRect(10, 20, 30, 40);
    const rect2 = new DOMRect(10, 20, 30, 40);
    const rect3 = new DOMRect(11, 20, 30, 40);

    expect(DOMRectUtils.hashCode(rect1)).toBe(DOMRectUtils.hashCode(rect2));
    expect(DOMRectUtils.hashCode(rect1)).not.toBe(DOMRectUtils.hashCode(rect3));
    expect(DOMRectUtils.hashCode(null as any)).toBe('null');
  });

  it('should calculate the intersection of two overlapping rectangles', () => {
    const rect1 = new DOMRect(0, 0, 100, 100);
    const rect2 = new DOMRect(50, 50, 100, 100);

    // Intersection should be from (50, 50) to (100, 100)
    // x: 50, y: 50
    // width: 100 - 50 = 50
    // height: 100 - 50 = 50

    const intersect = DOMRectUtils.intersect(rect1, rect2);
    expect(intersect).not.toBeNull();
    if (intersect) {
      expect(intersect.x).toBe(50);
      expect(intersect.y).toBe(50);
      expect(intersect.width).toBe(50);
      expect(intersect.height).toBe(50);
    }
  });

  it('should return null for non-intersecting rectangles', () => {
    const rect1 = new DOMRect(0, 0, 10, 10);
    const rect2 = new DOMRect(20, 20, 10, 10);
    expect(DOMRectUtils.intersect(rect1, rect2)).toBeNull();
  });

  it('should return null if any input is null', () => {
    const rect1 = new DOMRect(0, 0, 10, 10);
    expect(DOMRectUtils.intersect(rect1, null)).toBeNull();
    expect(DOMRectUtils.intersect(null, rect1)).toBeNull();
  });

  it('should return the inner rectangle if one is inside another', () => {
    const outer = new DOMRect(0, 0, 100, 100);
    const inner = new DOMRect(25, 25, 50, 50);

    const intersect = DOMRectUtils.intersect(outer, inner);
    expect(intersect).not.toBeNull();
    if (intersect) {
      expect(intersect.x).toBe(25);
      expect(intersect.y).toBe(25);
      expect(intersect.width).toBe(50);
      expect(intersect.height).toBe(50);
    }
  });
});

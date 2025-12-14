export class DOMRectUtils {
  /**
   * Returns a new DOMRect that is the union of two DOMRect objects.
   * The resulting DOMRect encompasses both input rectangles.
   */
  static union(rect1: DOMRect, rect2: DOMRect): DOMRect {
    const x = Math.min(rect1.x, rect2.x);
    const y = Math.min(rect1.y, rect2.y);
    const right = Math.max(rect1.right, rect2.right);
    const bottom = Math.max(rect1.bottom, rect2.bottom);

    return new DOMRect(x, y, right - x, bottom - y);
  }

  /**
   * Checks if two DOMRect objects intersect.
   */
  static isIntersect(rect1: DOMRect, rect2: DOMRect): boolean {
    return (
      rect1.left < rect2.right &&
      rect1.right > rect2.left &&
      rect1.top < rect2.bottom &&
      rect1.bottom > rect2.top
    );
  }
}

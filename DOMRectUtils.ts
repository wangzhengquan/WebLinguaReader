export default class DOMRectUtils {
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

  /**
   * Checks if the first DOMRect completely contains the second DOMRect.
   */
  static isContains(outer: DOMRect, inner: DOMRect): boolean {
    if(outer === null || inner === null) return false;
    return (
      outer.left <= inner.left &&
      outer.right >= inner.right &&
      outer.top <= inner.top &&
      outer.bottom >= inner.bottom
    );
  }

  static isContainsCoord(outer: DOMRect, clientX: number, clientY: number): boolean {
    if(outer === null) {
      return false;
    } 
    return (
      outer.left <= clientX &&
      outer.right >= clientX &&
      outer.top <= clientY &&
      outer.bottom >= clientY
    );
  }
}

export default class DOMRectUtils {
  /**
   * Returns a new DOMRect that is the union of two DOMRect objects.
   * The resulting DOMRect encompasses both input rectangles.
   */
  static union(rect1: DOMRect | null, rect2: DOMRect | null): DOMRect {
    if (rect1 === null) return rect2;
    if (rect2 === null) return rect1;
    const x = Math.min(rect1.x, rect2.x);
    const y = Math.min(rect1.y, rect2.y);
    const right = Math.max(rect1.right, rect2.right);
    const bottom = Math.max(rect1.bottom, rect2.bottom);

    return new DOMRect(x, y, right - x, bottom - y);
  }

  /**
   * Checks if two DOMRect objects intersect.
   */
  static isIntersect(rect1: DOMRect | null, rect2: DOMRect | null): boolean {
    if (rect1 === null || rect2 === null) return false;
    return (
      rect1.left <= rect2.right &&
      rect1.right >= rect2.left &&
      rect1.top <= rect2.bottom &&
      rect1.bottom >= rect2.top
    );
  }

  /**
   * Returns the intersection of two DOMRect objects.
   * Returns null if they do not intersect.
   */
  static intersect(rect1: DOMRect | null, rect2: DOMRect | null): DOMRect | null {
    if (rect1 === null || rect2 === null) return null;
    if (!DOMRectUtils.isIntersect(rect1, rect2)) return null;

    const x = Math.max(rect1.x, rect2.x);
    const y = Math.max(rect1.y, rect2.y);
    const right = Math.min(rect1.right, rect2.right);
    const bottom = Math.min(rect1.bottom, rect2.bottom);

    return new DOMRect(x, y, right - x, bottom - y);
  }

  /**
   * Checks if the first DOMRect completely contains the second DOMRect.
   */
  static contains(outer: DOMRect | null, inner: DOMRect | null): boolean {
    if (outer === null || inner === null) return false;
    return (
      outer.left <= inner.left &&
      outer.right >= inner.right &&
      outer.top <= inner.top &&
      outer.bottom >= inner.bottom
    );
  }

  static containsCoord(outer: DOMRect, clientX: number, clientY: number): boolean {
    if (outer === null) {
      return false;
    }
    return (
      outer.left <= clientX &&
      outer.right >= clientX &&
      outer.top <= clientY &&
      outer.bottom >= clientY
    );
  }

  static equals(rect1: DOMRect | null, rect2: DOMRect | null): boolean {
    if (rect1 === null && rect2 === null) return true;
    if (rect1 === null || rect2 === null) return false;
    return (
      rect1.x === rect2.x &&
      rect1.y === rect2.y &&
      rect1.width === rect2.width &&
      rect1.height === rect2.height
    );
  }

  static toString(rect: DOMRect | null): string {
    if (rect === null) return 'null';
    return `{${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}}`;
  }
  /**
   * Generates a hash code for a DOMRect.
   */
  static hashCode(rect: DOMRect | null): string {
    if (rect === null) return 'null';
    return `${rect.x},${rect.y},${rect.width},${rect.height}`;
  }
}

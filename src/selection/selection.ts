import DOMRectUtils from './DOMRectUtils';
import { UP, DOWN, LEFT, RIGHT } from '@/types';
import {
  computeLayoutBlocks,
  layoutBlockOf,
  intersectLayoutBlockOf,
  layoutBlockOfCoord
} from "./LayoutBlock";

const getSelectionRect = () => {
  const selection = window.getSelection();
  const rects: DOMRect[] = [];
  if (selection && selection.rangeCount > 0) {
    for (let i=0; i<selection.rangeCount; i++){
      const range = selection.getRangeAt(i);
      // if (!range.collapsed){
      rects.push(range.getBoundingClientRect()) ;
    }
  }
  const rect = DOMRectUtils.union(...rects);
console.log("getSelectionRect:", rect);
  return rect;
}


const selectionNode = (span: HTMLElement, atEnd: boolean) => {
  return {
    node: span.firstChild,
    offset: atEnd ? (span.textContent?.length || 0) : 0,
    span
  };
};

const highPrecisionSelectionNode = (span: HTMLElement, clientX: number, clientY: number) => {
  // Try high-precision selection if native API supports it
  const doc = document as any;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos && (pos.offsetNode === span.firstChild || pos.offsetNode === span)) {
      return { node: pos.offsetNode, offset: pos.offset, span };
    }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range && (range.startContainer === span.firstChild || range.startContainer === span)) {
      return { node: range.startContainer, offset: range.startOffset, span };
    }
  } else {
    // Fallback to simpler midpoint check
    const r = span.getBoundingClientRect();
    const isAtEnd = clientX > (r.left + r.width / 2);
    return selectionNode(span, isAtEnd);
  }
}

// const selectionNode = (span: HTMLElement, atEnd: boolean) => {
//   if (!span.firstChild)
//     return { node: span, offset: 0, span}
//   else return selectionNode(span, atEnd);
// };


const getClosestTextNodeOfSpans = (clientX: number, clientY: number, spans: HTMLElement[], direction: number, start: boolean, weightX: number) => {
  if (!spans || spans.length === 0) return null;
  const distance = (r: DOMRect) => {
    // x 权重小
    const dx = Math.min(Math.abs(r.left - clientX), Math.abs(r.right - clientX)) * weightX;
    // const dy = r.top + r.height / 2 - clientY ;
    const dy = Math.min(Math.abs(r.top + r.height / 2 - clientY), Math.abs(r.bottom - r.height / 2 - clientY))
    const dist = dx * dx + dy * dy;
    return dist;
  }
  let span = spans[0];
  // console.log("spans.length=======", spans.length)
  let minDist = distance(span.getBoundingClientRect());
  for (let i = 1; i < spans.length; i++) {
    const s = spans[i];
    const r = s.getBoundingClientRect();
    const dist = distance(r);

    if (dist <= minDist) {
      span = s;
      minDist = dist;
    }
  }

  const spanRect = span.getBoundingClientRect();
  const atEnd = clientY >= spanRect.bottom  
    || (!start && !!(direction & DOWN)) 
    || (start && !!(direction & UP));
  return selectionNode(span, atEnd) // 如果刚开始选择且鼠标在文字右侧开始往下滑动则从文本头开始选择
  
}


const getSelectNodeOfSpans = (clientX: number, clientY: number, spans: HTMLElement[], direction: number, start: boolean, weightX: number) => {
  // Strict vertical check: Cursor MUST be between top and bottom of the span
  if (!spans || spans.length === 0) return null;
  const rowSpans = spans.filter(s => {
    const r = s.getBoundingClientRect();
    return clientY >= r.top && clientY <= r.bottom;
  });
  // If on a row (or horizontal margin of a row)
  if (rowSpans.length > 0) {
    // Sort by X position
    rowSpans.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    const firstSpan = rowSpans[0];
    const lastSpan = rowSpans[rowSpans.length - 1];
    const firstRect = firstSpan.getBoundingClientRect();
    const lastRect = lastSpan.getBoundingClientRect();
    const atEnd = (!start && !!(direction & DOWN)) || (start && !!(direction & UP));
    if (clientX < firstRect.left) {
      
      console.log("=====left margin", firstSpan, atEnd, start, direction.toString(2));
      return selectionNode(firstSpan, atEnd);
    } else if (clientX > lastRect.right) {
      console.log("=====right margin", lastSpan, atEnd, start, direction.toString(2));
      return selectionNode(lastSpan, atEnd);
    } else {
      // Inside the row (between words or columns)
      for (let i = 0; i < rowSpans.length; i++) {
        const span = rowSpans[i];
        const r = span.getBoundingClientRect();
        // Hovering this span
        if (clientX >= r.left && clientX <= r.right) {
          return highPrecisionSelectionNode(span, clientX, clientY);
        }

        if (i < rowSpans.length - 1) {
          const nextSpan = rowSpans[i + 1];
          const nextR = nextSpan.getBoundingClientRect();
          // Gutter between this and next
          if (clientX > r.right && clientX < nextR.left) {
            const distLeft = clientX - r.right;
            const distRight = nextR.left - clientX;
            if (distLeft <= distRight) {
              console.log("=====gutter left", span);
              return selectionNode(span, true);
            } else {
              console.log("=====gutter right", nextSpan);
              return selectionNode(nextSpan, false);
            }
          }
        }
      }
    }
  } else {
    const result = getClosestTextNodeOfSpans(clientX, clientY, spans, direction, start, weightX);
    console.log("===== closest span: ", result.span)
    return result;
  }
}

const getSelectNodeAt = (clientX: number, clientY: number) => {
  const span = document.elementFromPoint(clientX, clientY) as HTMLElement;
  if(span.tagName === "SPAN" && span.textContent){
    return highPrecisionSelectionNode(span, clientX, clientY);
  }
  return null;
}

const getSelectNodeBy = (clientX: number, clientY: number, layer: HTMLElement, direction: number, start: boolean ) => {
  const result = getSelectNodeAt(clientX, clientY)
  if(result && result.node) {
    console.log("getSelectNodeAt", result.span);
    return result;
  }

  let spans = Array.from(layer.children) as HTMLElement[];
  spans = spans.filter(s => s.tagName === "SPAN")
  if (spans.length === 0) return null;

  const layoutBlocks = computeLayoutBlocks(layer)
  const mouseBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks)
  const selRect = getSelectionRect();

  // console.log("getSelectNodeBy:", {mouseBlock, selRect});
  if (mouseBlock) {
    console.log("getSelectNodeBy in mouseBlock");
    const mouseBlockSpans = spans.filter(s => {
      const r = s.getBoundingClientRect();
      return DOMRectUtils.contains(mouseBlock, r);
    });
    const result = getSelectNodeOfSpans(clientX, clientY, mouseBlockSpans, direction, start, 0);
    if (result && result.node) return result;
  }

  if (selRect) {
    const intersectBlocks = intersectLayoutBlockOf(selRect, layoutBlocks);
    const selBlock = DOMRectUtils.union(...intersectBlocks, selRect);
    const selBlockSpans = spans.filter(s => {
      const r = s.getBoundingClientRect();
      return DOMRectUtils.contains(selBlock, r);
    });
    console.log("=====getSelectNodeBy in selBlock ",intersectBlocks.length, selBlockSpans.length, DOMRectUtils.equals(selBlock, selRect));
    // if (!DOMRectUtils.equals(selBlock, selRect)){
    //   // 如果selBlock和selRect是同一块区域就没必要再选择了，会跳出这一段在全部spans中选择。 但是如果是撤销选择呢？
    //   const result = getSelectNodeOfSpans(clientX, clientY, selBlockSpans, direction, start);
    //   if (result && result.node ) return result;
    // }
    const result = getSelectNodeOfSpans(clientX, clientY, selBlockSpans, direction, start, 0);
    if (result && result.node ) return result;
  }

  console.log("getSelectNodeBy in all spans");
  return getClosestTextNodeOfSpans(clientX, clientY, spans, direction, start, 0.2);

};



/**
 * Expands selection to the word boundaries at the given node/offset.
 */
const selectWordAtNode = (node: Node, offset: number) => {
  let targetNode = node;
  let targetOffset = offset;

  // Normalize to Text Node if Element provided
  if (targetNode.nodeType === Node.ELEMENT_NODE) {
    if (targetOffset < targetNode.childNodes.length) {
      targetNode = targetNode.childNodes[targetOffset];
      targetOffset = 0;
    } else if (targetNode.childNodes.length > 0) {
      // End of element
      targetNode = targetNode.lastChild!;
      targetOffset = targetNode.textContent?.length || 0;
    }
  }
  if (targetNode.nodeType !== Node.TEXT_NODE) return;

  const text = targetNode.textContent || "";
  if (!text) return;

  const isWordChar = (char: string) => /[\p{L}\p{N}_]/u.test(char);
  const len = text.length;

  // Anchor determines the "type" of character we are selecting (word vs non-word)
  // If clicking at the end of a word, we want that word.
  let anchor = targetOffset;
  if (anchor >= len && anchor > 0) anchor = len - 1; // Clamp to last char if at end
  if (anchor < 0) anchor = 0;

  const type = isWordChar(text[anchor]);

  let start = anchor;
  let end = anchor + 1; // End is exclusive for Range, but we scan inclusively with char index

  // Scan backwards
  while (start > 0 && isWordChar(text[start - 1]) === type) {
    start--;
  }

  // Scan forwards
  while (end < len && isWordChar(text[end]) === type) {
    end++;
  }

  const range = document.createRange();
  try {
    range.setStart(targetNode, start);
    range.setEnd(targetNode, end);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch (e) {
    console.warn("Selection range error", e);
  }
};




/**
 * Helper: Find closest text node with Strict Row Priority.
 * Prevents selecting adjacent lines when in margins.
 */
const getSelectNodeBy1 = (clientX: number, clientY: number, layer: HTMLElement, layoutBlocks: DOMRect[], direction: number, start: boolean = false)  => {
  const spans = Array.from(layer.children) as HTMLElement[];
  if (spans.length === 0) return null;

  const mouseBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks)
  const selRect = getSelectionRect();
  let selBlock = selRect ? intersectLayoutBlockOf(selRect, layoutBlocks) : null;
  selBlock = DOMRectUtils.union(selBlock, selRect);
  // 1. Identify "Visual Row"
  // Strict vertical check: Cursor MUST be between top and bottom of the span
  const rowSpans = spans.filter(s => {
    const r = s.getBoundingClientRect();
    // s.tagName==='SPAN' &&
    return s.tagName === 'SPAN' && clientY >= r.top && clientY <= r.bottom;
    // return  clientY >= r.top && clientY <= r.bottom;
  });
  // const layoutBlocks = computeLayoutBlocks(layer)
  // If on a row (or horizontal margin of a row)
  if (rowSpans.length > 0) {
    // Sort by X position
    rowSpans.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    const firstSpan = rowSpans[0];
    const lastSpan = rowSpans[rowSpans.length - 1];
    const firstRect = firstSpan.getBoundingClientRect();
    const lastRect = lastSpan.getBoundingClientRect();

    // Left Margin -> Start of First Span
    if (clientX < firstRect.left) {
      // if (start){
      //   console.log('=====left margin, return null')
      //   return null;
      // }
      // const selRect = getSelectionRect();
      // if(selRect) {
      // }

      if (layoutBlocks.length > 0 && clientX < layoutBlocks[0].left && firstRect.left < layoutBlocks[0].right) {
        console.log('=====left margin 1', firstSpan)
        // 沿着最左边选择，且firstSpan 不在第二栏
        return selectionNode(firstSpan, false);
      }
      // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
      if (DOMRectUtils.contains(mouseBlock, firstRect)) {
        console.log('=====left margin 2', firstSpan)
        return selectionNode(firstSpan, false);
      }
    }

    // Right Margin -> End of Last Span
    else if (clientX > lastRect.right) {

      // const selRect = getSelectionRect();
      // if (selRect && !DOMRectUtils.isIntersect(layoutBlockOf(lastRect, layoutBlocks), selRect) ) {
      //   return null;
      // } 
      if (layoutBlocks.length > 0 && clientX > layoutBlocks[layoutBlocks.length - 1].right && lastRect.right > layoutBlocks[layoutBlocks.length - 1].left) {
        console.log('=====left margin 1', firstSpan)
        // 沿着右边选择，且firstSpan 不在第一栏
        return selectionNode(lastSpan, true);
      }
      // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
      if (DOMRectUtils.contains(mouseBlock, lastRect)) {
        return selectionNode(lastSpan, true);
      }
      // if (direction & RIGHT) {
      //   console.log('=====right margin ')
      //   return null;
      // }
    }
    else {
      // Inside the row (between words or columns)
      for (let i = 0; i < rowSpans.length; i++) {
        const span = rowSpans[i];
        const r = span.getBoundingClientRect();

        // Hovering this span
        if (clientX >= r.left && clientX <= r.right) {
          // Try high-precision selection if native API supports it
          const doc = document as any;
          if (doc.caretPositionFromPoint) {
            const pos = doc.caretPositionFromPoint(clientX, clientY);
            if (pos && (pos.offsetNode === span.firstChild || pos.offsetNode === span)) {
              return { node: pos.offsetNode, offset: pos.offset };
            }
          } else if (doc.caretRangeFromPoint) {
            const range = doc.caretRangeFromPoint(clientX, clientY);
            if (range && (range.startContainer === span.firstChild || range.startContainer === span)) {
              return { node: range.startContainer, offset: range.startOffset };
            }
          }

          // Fallback to simpler midpoint check
          const isAtEnd = clientX > (r.left + r.width / 2);
          return selectionNode(span, isAtEnd);
        }

        // Gutter between this and next
        if (i < rowSpans.length - 1) {
          const nextSpan = rowSpans[i + 1];
          const nextR = nextSpan.getBoundingClientRect();

          if (clientX > r.right && clientX < nextR.left) {

            if (selRect) {
              if (clientX > selRect.right && clientX < nextR.left) {
                // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
                // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
                if (DOMRectUtils.contains(mouseBlock, nextR)) {
                  console.log("=====gutter selRect right 1", nextSpan);
                  return selectionNode(nextSpan, false);
                } else {
                  console.log("=====gutter selRect left 1", span);
                  return selectionNode(span, true);
                }
              } else if (clientX > r.right && clientX < selRect.left) {
                // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
                // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
                if (DOMRectUtils.contains(mouseBlock, r)) {
                  console.log("=====gutter selRect left 2", nextSpan);
                  return selectionNode(span, true);
                } else {
                  console.log("=====gutter selRect right 2", span);
                  return selectionNode(nextSpan, false);
                }
              }
            }

            const leftLayoutBlock = layoutBlockOf(r, layoutBlocks);
            const rightLayoutBlock = layoutBlockOf(nextR, layoutBlocks);
            if (leftLayoutBlock === null || rightLayoutBlock === null) {
              throw new Error("Layout block not found: " + leftLayoutBlock + rightLayoutBlock);
            };
            if (leftLayoutBlock === rightLayoutBlock) {
              const distLeft = clientX - r.right;
              const distRight = nextR.left - clientX;
              if (distLeft <= distRight) {
                console.log("=====gutter left", span);
                return selectionNode(span, true);
              } else {
                console.log("=====gutter right", nextSpan);
                return selectionNode(nextSpan, false);
              }
            } else {
              const distLeft = clientX - leftLayoutBlock.right;
              const distRight = rightLayoutBlock.left - clientX;
              if (distLeft <= distRight) {
                console.log("=====gutter left layout block", span);
                // 如果刚开始选择且鼠标在文字右侧开始往下滑动则从文本头开始选择，其他的情况都从文本尾开始选择
                return selectionNode(span, !(start && !!(direction & DOWN)));
              } else {
                console.log("=====gutter right layout block", nextSpan);
                return selectionNode(nextSpan, false);
              }
            }
          }
        }
      }
    }
  }

  let span;
  // let minDy = Infinity, minDx = Infinity;
  let minDist = Infinity;
  // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
  for (const s of spans) {
    if (s.tagName !== "SPAN") continue;
    const r = s.getBoundingClientRect();
    if (mouseBlock && !DOMRectUtils.contains(mouseBlock, r)) continue;
    // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
    if (selBlock && !DOMRectUtils.contains(selBlock, r) && !DOMRectUtils.contains(mouseBlock, r)) continue;
    // x 权重小
    const dx = Math.min(Math.abs(r.left - clientX), Math.abs(r.right - clientX)) * .2;
    // const dy = r.top + r.height / 2 - clientY ;
    const dy = Math.min(Math.abs(r.top + r.height / 2 - clientY), Math.abs(r.bottom - r.height / 2 - clientY))
    const dist = dx * dx + dy * dy;

    if (dist <= minDist) {
      // if(r.left > clientX && (direction & LEFT)){
      //   continue;
      // }
      span = s;
      // minDx = dx, minDy = dy;
      minDist = dist;
    }
  }

  if (span) {
    const r = span.getBoundingClientRect();
    console.log("findStartClosestNode fallback, span=", span, clientX >= r.right || clientY >= r.bottom, clientX, r.right, clientY, r.bottom)
    return selectionNode(span, clientX >= r.right || clientY >= r.bottom);
  } else {
    console.log("findStartClosestNode fallback, span=null")
    return null;
  }
};


export {
  computeLayoutBlocks,
  getSelectNodeBy,
  selectWordAtNode,
  getSelectNodeAt,
  getSelectionRect
} 


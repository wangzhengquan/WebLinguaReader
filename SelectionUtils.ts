import DOMRectUtils from './DOMRectUtils';
import  {
  UP,
  DOWN,
  LEFT,
  RIGHT
} from './types';

const getSelectionRect = () => {
  const selection = window.getSelection();
  if( selection && selection.rangeCount > 0) {
    return selection.getRangeAt(0).getBoundingClientRect();
  }
  return null;
}


const getResult = (span: HTMLElement, atEnd: boolean) => {
  return { 
    node: span.firstChild, 
    offset: atEnd ? (span.textContent?.length || 0) : 0 
  };
};

const getSafeResult = (span: HTMLElement, atEnd: boolean) => {
  if(!span.firstChild) 
    return { node: span, offset: 0 }
  else return getResult(span, atEnd);
};

const computeLayoutBlocks = (textLayer: HTMLElement): DOMRect[] => {
  
  // let spans = Array.from(layer.children) as HTMLElement[];
  
  // if (spans.length === 0) return blocks;
  // spans = spans.filter(s => s.tagName === "SPAN")
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_ELEMENT);
  const spans: HTMLElement[] = [];
  let node;
  while(node = walker.nextNode()) {
    if(node.tagName === "SPAN"){
      spans.push(node as HTMLElement);
    }
  }

  if (spans.length === 0) return [];
  const blocks: DOMRect[] = [];
  let currentBlock: DOMRect | null = null;
  // let lastEle : HTMLElement | null = null;
  for (const span of spans) {
    const r = span.getBoundingClientRect()
    if(r.width === 0 || r.height === 0) continue;// skip invisible
    if (!currentBlock) {
      currentBlock = r;
      // currentEle = span;
    } else {
      // Check vertical overlap
      if ((r.top - currentBlock.bottom < 50) 
        && (Math.abs(r.left - currentBlock.left) < 20
          || Math.abs(r.right - currentBlock.right) < 20
          ||(r.left - currentBlock.right < 5 && r.left - currentBlock.right > 0)
          || (currentBlock.left - r.left) * (currentBlock.right - r.right) < 0
          || DOMRectUtils.isIntersect(currentBlock, r) 
        )
      ) {
        // Merge into current block
        currentBlock = DOMRectUtils.union(currentBlock, r);
      } else {
        // console.log("break==",currentBlock, "\nr====", r);
        // No overlap, push current block and start new
        blocks.push(currentBlock);
        currentBlock = r;
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // blocks.sort((a, b) => {
  //   // 首先比较 left
  //   if (a.left !== b.left) {
  //     return a.left - b.left;
  //   }
  //   // 如果 left 相等，再比较 top
  //   return a.top - b.top;
  // });
  return blocks;
}

function layoutBlockOf(rect: DOMRect, blocks: DOMRect[] ): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.isContains(block, rect)) {
      return block;
    }
  }
  
  return null;
}

function intersectLayoutBlockOf(rect: DOMRect, blocks: DOMRect[] ): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.isIntersect(block, rect)) {
      return block;
    }
  }
  
  return null;
}

 function layoutBlockOfCoord(clientX: number, clientY: number, blocks: DOMRect[] ): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.isContainsCoord(block, clientX, clientY)) {
      return block;
    }
  }
  return null;
}


/**
 * Helper: Find closest text node with Strict Row Priority.
 * Prevents selecting adjacent lines when in margins.
 */
const getPreferredTextNode1 = (clientX: number, clientY: number, layer: HTMLElement) => (start: boolean = false, direction: number, layoutBlocks: DOMRect[]) => {
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
      return s.tagName==='SPAN' && clientY >= r.top && clientY <= r.bottom;
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
      
      if(layoutBlocks.length> 0 && clientX < layoutBlocks[0].left && firstRect.left < layoutBlocks[0].right) {
        console.log('=====left margin 1', firstSpan)
        // 沿着最左边选择，且firstSpan 不在第二栏
        return getResult(firstSpan, false);
      }
      // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
      if (DOMRectUtils.isContains(mouseBlock, firstRect) ){
        console.log('=====left margin 2', firstSpan)
        return getResult(firstSpan, false);
      }
    }
    
    // Right Margin -> End of Last Span
    else if (clientX > lastRect.right) {
      
      // const selRect = getSelectionRect();
      // if (selRect && !DOMRectUtils.isIntersect(layoutBlockOf(lastRect, layoutBlocks), selRect) ) {
      //   return null;
      // } 
      if(layoutBlocks.length > 0 && clientX > layoutBlocks[layoutBlocks.length-1].right && lastRect.right > layoutBlocks[layoutBlocks.length-1].left) {
        console.log('=====left margin 1', firstSpan)
        // 沿着右边选择，且firstSpan 不在第一栏
        return getResult(lastSpan, true);
      }
      // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
      if ( DOMRectUtils.isContains(mouseBlock, lastRect) ){
        return getResult(lastSpan, true);
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
            const isAtEnd = clientX > (r.left + r.width/2);
            return getResult(span, isAtEnd);
        }

        // Gutter between this and next
        if (i < rowSpans.length - 1) {
          const nextSpan = rowSpans[i+1];
          const nextR = nextSpan.getBoundingClientRect();
          
          if (clientX > r.right && clientX < nextR.left) {
            
            if(selRect) {
              if (clientX > selRect.right && clientX < nextR.left) {
                // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
                // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
                if (DOMRectUtils.isContains(mouseBlock, nextR)){
                  console.log("=====gutter selRect right 1", nextSpan);
                  return getResult(nextSpan, false);
                } else{
                  console.log("=====gutter selRect left 1", span);
                  return getResult(span, true);
                }
              } else if (clientX > r.right && clientX < selRect.left) {
                // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
                // const layoutBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks);
                if (DOMRectUtils.isContains(mouseBlock, r)){
                  console.log("=====gutter selRect left 2", nextSpan);
                  return getResult(span, true);
                } else{
                  console.log("=====gutter selRect right 2", span);
                  return getResult(nextSpan, false);
                }
              } 
            } 

            const leftLayoutBlock = layoutBlockOf(r, layoutBlocks);
            const rightLayoutBlock = layoutBlockOf(nextR, layoutBlocks);
            if(leftLayoutBlock === null || rightLayoutBlock === null) {
              throw new Error("Layout block not found: " + leftLayoutBlock + rightLayoutBlock);
            };
            if(leftLayoutBlock === rightLayoutBlock){
              const distLeft = clientX - r.right;
              const distRight = nextR.left - clientX;
              if (distLeft <= distRight) {
                console.log("=====gutter left", span);
                return getSafeResult(span, true);
              } else {
                console.log("=====gutter right", nextSpan);
                return getSafeResult(nextSpan, false);
              }
            } else {
              const distLeft = clientX - leftLayoutBlock.right;
              const distRight = rightLayoutBlock.left - clientX;
              if (distLeft <= distRight) {
                console.log("=====gutter left layout block", span);
                // 如果刚开始选择且鼠标在文字右侧开始往下滑动则从文本头开始选择，其他的情况都从文本尾开始选择
                return getSafeResult(span, !(start && !!(direction & DOWN)));
              } else {
                console.log("=====gutter right layout block", nextSpan);
                return getSafeResult(nextSpan, false);
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
    if(s.tagName !=="SPAN") continue;
    const r = s.getBoundingClientRect();
    if(mouseBlock && !DOMRectUtils.isContains(mouseBlock, r)) continue;
    // 如果已经有选区了，那么除非鼠标明显进入选区外的block，优先选择选区所在的block的文字
    if(selBlock && !DOMRectUtils.isContains(selBlock, r) && !DOMRectUtils.isContains(mouseBlock, r) ) continue;
     // x 权重小
    const dx = Math.min(Math.abs(r.left - clientX), Math.abs(r.right - clientX)) * .2;
    // const dy = r.top + r.height / 2 - clientY ;
    const dy = Math.min(Math.abs(r.top + r.height / 2 - clientY), Math.abs(r.bottom - r.height / 2 - clientY))
    const dist = dx * dx  + dy * dy;
    
    if (dist <= minDist){
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
    console.log("findStartClosestNode fallback, span=", span ,clientX >= r.right || clientY >= r.bottom, clientX , r.right , clientY , r.bottom)
    return getResult(span, clientX >= r.right || clientY >= r.bottom);
  } else {
    console.log("findStartClosestNode fallback, span=null")
    return null;
  }
};
  
const getClosestTextNodeOfSpans = (clientX: number, clientY: number, spans: HTMLElement[], start: boolean, direction: number,) => {
  if(!spans || spans.length === 0) return null;
  const distance = (r: DOMRect) => {
    // x 权重小
    const dx = Math.min(Math.abs(r.left - clientX), Math.abs(r.right - clientX)) * .2;
    // const dy = r.top + r.height / 2 - clientY ;
    const dy = Math.min(Math.abs(r.top + r.height / 2 - clientY), Math.abs(r.bottom - r.height / 2 - clientY))
    const dist = dx * dx  + dy * dy;
    return dist;
  }
  let span = spans[0];
  let minDist = distance(span.getBoundingClientRect());
  for (let i = 1; i< spans.length; i++) {
    const s = spans[i];
    const r = s.getBoundingClientRect();
    const dist = distance(r);
    
    if ( dist <= minDist){
      span = s;
      minDist = dist;
    }
  }
  
  const spanRect = span.getBoundingClientRect();
  if(clientX < spanRect.left && !!(direction & LEFT)){
    return null;
  }
  if (clientX > spanRect.right && !!(direction & RIGHT)){
    return null;
  }
  console.log("getClosestTextNodeOfSpans, span=", span )
  return getResult(span, clientY >= spanRect.bottom  // 鼠标在文字下方
    || (clientX >= spanRect.right && !(start && !!(direction & DOWN))) // 如果刚开始选择且鼠标在文字右侧开始往下滑动则从文本头开始选择
  );
  // return getResult(span, clientX >= spanRect.right || clientY >= spanRect.bottom);
}


const getPreferredTextNodeOfSpans = (clientX: number, clientY: number, spans: HTMLElement[], start: boolean, direction: number ) => {
  // Strict vertical check: Cursor MUST be between top and bottom of the span
  if(!spans || spans.length === 0) return null;
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
    if (clientX < firstRect.left) {
      console.log("=====left margin", firstSpan);
      return getResult(firstSpan, false);
    } else if (clientX > lastRect.right) {
      console.log("=====right margin", lastSpan);
      return getResult(lastSpan, true);
    } else {
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
          } else {
             // Fallback to simpler midpoint check
            const isAtEnd = clientX > (r.left + r.width/2);
            return getResult(span, isAtEnd);
          }
        }
        
        if (i < rowSpans.length - 1) {
          const nextSpan = rowSpans[i+1];
          const nextR = nextSpan.getBoundingClientRect();
          // Gutter between this and next
          if (clientX > r.right && clientX < nextR.left) {
            const distLeft = clientX - r.right;
            const distRight = nextR.left - clientX;
            if (distLeft <= distRight) {
              console.log("=====gutter left", span);
              return getSafeResult(span, true);
            } else {
              console.log("=====gutter right", nextSpan);
              return getSafeResult(nextSpan, false);
            }
          }
        }
      }
    }
  } else {
    return getClosestTextNodeOfSpans(clientX, clientY, spans, start, direction);
  }
}

const getPreferredTextNode = (clientX: number, clientY: number, layer: HTMLElement) => (start: boolean = false, direction: number, layoutBlocks: DOMRect[]) => {
  let spans = Array.from(layer.children) as HTMLElement[];
  spans = spans.filter(s => s.tagName === "SPAN")
  if (spans.length === 0) return null;

  const mouseBlock = layoutBlockOfCoord(clientX, clientY, layoutBlocks)
  const selRect = getSelectionRect();
  
  // console.log("getPreferredTextNode:", {mouseBlock, selRect});
  if (mouseBlock) {
    console.log("getPreferredTextNode in mouseBlock");
    const mouseBlockSpans = spans.filter(s => {
      const r = s.getBoundingClientRect();
      return DOMRectUtils.isContains(mouseBlock, r);
    });
    const result = getPreferredTextNodeOfSpans(clientX, clientY, mouseBlockSpans, start, direction);
    if(result && result.node) return result;
  }
  
  if(selRect) {
    const selBlock = DOMRectUtils.union(intersectLayoutBlockOf(selRect, layoutBlocks), selRect);
    const selBlockSpans = spans.filter(s => {
      const r = s.getBoundingClientRect();
      return DOMRectUtils.isContains(selBlock, r);
    });
    console.log("getPreferredTextNode in selRect", selBlock, selBlockSpans);
    const result = getPreferredTextNodeOfSpans(clientX, clientY, selBlockSpans, start, direction);
    if(result && result.node) return result;
  }

  console.log("getPreferredTextNode in all spans");
  return getClosestTextNodeOfSpans(clientX, clientY, spans, start, direction);
   
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
  } catch(e) {
      console.warn("Selection range error", e);
  }
};

export {
  computeLayoutBlocks, 
  getPreferredTextNode,
  selectWordAtNode
}
  
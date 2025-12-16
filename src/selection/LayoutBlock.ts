import DOMRectUtils from './DOMRectUtils';

const computeLayoutBlocks = (textLayer: HTMLElement): DOMRect[] => {
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_ELEMENT);
  const spans: HTMLElement[] = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.tagName === "SPAN") {
      spans.push(node as HTMLElement);
    }
  }

  if (spans.length === 0) return [];
  const blocks: DOMRect[] = [];
  let currentBlock: DOMRect | null = null;
  // let lastEle : HTMLElement | null = null;
  for (const span of spans) {
    const r = span.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue; // skip invisible
    if (!currentBlock) {
      currentBlock = r;
    } else {
      // Check vertical overlap
      if ((r.top - currentBlock.bottom < 50)
        && (Math.abs(r.left - currentBlock.left) < 20
          || Math.abs(r.right - currentBlock.right) < 20
          || (r.left - currentBlock.right < 5 && r.left - currentBlock.right > 0)
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

function layoutBlockOf(rect: DOMRect, blocks: DOMRect[]): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.contains(block, rect)) {
      return block;
    }
  }

  return null;
}

function intersectLayoutBlockOf(rect: DOMRect, blocks: DOMRect[]): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.isIntersect(block, rect)) {
      return block;
    }
  }

  return null;
}

function layoutBlockOfCoord(clientX: number, clientY: number, blocks: DOMRect[]): DOMRect | null {
  for (const block of blocks) {
    if (DOMRectUtils.containsCoord(block, clientX, clientY)) {
      return block;
    }
  }
  return null;
}

export {
  computeLayoutBlocks,
  layoutBlockOf,
  intersectLayoutBlockOf,
  layoutBlockOfCoord
}

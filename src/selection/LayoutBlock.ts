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
      if ((r.top - currentBlock.bottom < 20)
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
        
        if(blocks.length > 0 && DOMRectUtils.intersect(currentBlock, blocks[blocks.length - 1])) {
          blocks[blocks.length - 1] = DOMRectUtils.union(currentBlock, blocks[blocks.length - 1]);
        } else {
          blocks.push(currentBlock);
        }
        
        currentBlock = r;
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  blocks.sort((a, b) => {
    // 首先比较 left
    if (a.left !== b.left) {
      return a.left - b.left;
    }
    // 如果 left 相等，再比较 top
    return a.top - b.top;
  });
  // for (let i = 0; i < blocks.length; i++) {
  //   for (let j = i + 1; j < blocks.length; j++) {
  //     if (DOMRectUtils.isIntersect(blocks[i], blocks[j])) {
  //       blocks[i] = DOMRectUtils.union(blocks[i], blocks[j]);
  //       blocks.splice(j, 1);
  //       j--;
  //     }
  //   }
  // }
  for (let i = 0; i < blocks.length-1; i++) {
    if (DOMRectUtils.isIntersect(blocks[i], blocks[i+1])){
      blocks[i] = DOMRectUtils.union(blocks[i], blocks[i+1]);
      blocks.splice(i+1, 1);
      i--;
    }
  }
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

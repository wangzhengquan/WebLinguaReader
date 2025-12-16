import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PDFDocumentProxy } from '../types';
import { extractTextFromPage, pdfjs } from '../services/pdfService';
import { Loader2 as Loader2Icon } from 'lucide-react';
import DOMRectUtils from '@/DOMRectUtils';
interface PDFViewerProps {
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  scale: number;
  onTextExtracted: (text: string) => void;
  onPageChange: (total: number) => void;
  onNavigatePage: (page: number) => void;
  highlightedText?: string | null;
}

interface PDFPageProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  scale: number;
  highlightedText?: string | null;
  onTextReady: (pageNumber: number, text: string) => void;
  isActivePage: boolean;
  forcePreload: boolean;
}

const UP = 1, DOWN = 1 << 1, LEFT = 1 << 2, RIGHT = 1 << 3;

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
      // console.log("-===== node:", node);
    }
      
  }

  if (spans.length === 0) return [];
  const blocks: DOMRect[] = [];
  let currentBlock: DOMRect | null = null;
  let lastEle : HTMLElement | null = null;
  for (const span of spans) {
    const r = span.getBoundingClientRect()
    
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
    lastEle = span;
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
  return blocks;
}

function layoutBlockOf(rect: DOMRect, blocks: DOMRect[] ): DOMRect {
  for (const block of blocks) {
    if (DOMRectUtils.isContains(block, rect)) {
      return block;
    }
  }
  
  return null;
}

function intersectLayoutBlockOf(rect: DOMRect, blocks: DOMRect[] ): DOMRect {
  for (const block of blocks) {
    if (DOMRectUtils.isIntersect(block, rect)) {
      return block;
    }
  }
  
  return null;
}

function layoutBlockOfCoord(clientX: number, clientY: number, blocks: DOMRect[] ): DOMRect {
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
const findClosestTextNode = (clientX: number, clientY: number, layer: HTMLElement) => (start: boolean = false, direction: number, layoutBlocks: DOMRect[]) => {
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
  
 

const getRelativeRect = (rect: DOMRect, layer: HTMLElement) => {
  const layerRect = layer.getBoundingClientRect();
  return {
      top: rect.top - layerRect.top,
      left: rect.left - layerRect.left,
      width: rect.width,
      height: rect.height
  };
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

// Sub-component for individual pages
const PDFPage: React.FC<PDFPageProps> = ({ 
  pageNumber, 
  pdfDocument, 
  scale, 
  highlightedText, 
  onTextReady, 
  isActivePage,
  forcePreload
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [renderedScale, setRenderedScale] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // Unified rendering state
  const [shouldRender, setShouldRender] = useState(forcePreload);
  
  // Initialize with null to indicate "loading dimensions"
  const [dimensions, setDimensions] = useState<{width: number, height: number} | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [highlights, setHighlights] = useState<DOMRect[]>([]);
  const [layoutBlocks, setLayoutBlocks] = useState<DOMRect[]>([]);

  // Update state if forcePreload changes
  useEffect(() => {
    if (forcePreload) {
      setShouldRender(true);
    }
  }, [forcePreload]);

  // 1. Eagerly fetch page dimensions (Layout Phase)
  useEffect(() => {
    let active = true;
    const fetchDimensions = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        if (active) {
          setDimensions({ width: viewport.width, height: viewport.height });
        }
      } catch (e) {
        console.error(`Error fetching dimensions for page ${pageNumber}`, e);
      }
    };
    fetchDimensions();
    return () => { active = false; };
  }, [pdfDocument, pageNumber, scale]);


  // 2. Intersection Observer (Paint Phase) - Trigger Render
  useEffect(() => {
    if (shouldRender) return;

    const element = wrapperRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldRender(true);
            observer.disconnect();
          }
        });
      },
      {
        root: null, 
        rootMargin: '200% 0px', 
        threshold: 0
      }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [pageNumber, shouldRender]); 


  // 3. Extract text when page becomes active (Logic Phase)
  useEffect(() => {
    if (isActivePage) {
      pdfDocument.getPage(pageNumber).then(page => {
         extractTextFromPage(page).then(text => {
            onTextReady(pageNumber, text);
         });
      });
    }
  }, [isActivePage, pdfDocument, pageNumber, onTextReady]);


  // 4. Robust Text Highlighting Logic (Interactive Phase)
  useEffect(() => {
    if (!highlightedText || !textLayerRef.current || !shouldRender) {
      setHighlights([]);
      return;
    }
    const findRobustRects = (textLayer) => {
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node;
      while(node = walker.nextNode()) {
          nodes.push(node as Text);
      }

      if (nodes.length === 0) return [];

      const fullText = nodes.map(n => n.textContent).join('');
      const normalize = (s: string) => s.replace(/[\s\r\n]+/g, '').toLowerCase();
      const searchNorm = normalize(highlightedText);
      const textNorm = normalize(fullText);

      const startIndexNorm = textNorm.indexOf(searchNorm);
      if (startIndexNorm === -1) return [];

      const endIndexNorm = startIndexNorm + searchNorm.length;
      let currentNormIndex = 0;
      let startNode: Text | null = null;
      let startOffset = -1;
      let endNode: Text | null = null;
      let endOffset = -1;

      for (const textNode of nodes) {
          const nodeText = textNode.textContent || "";
          const nodeTextNorm = normalize(nodeText);
          const nodeLen = nodeTextNorm.length;

          if (startNode === null) {
            if (currentNormIndex + nodeLen > startIndexNorm) {
              startNode = textNode;
              const needed = startIndexNorm - currentNormIndex;
              let seen = 0;
              for (let i = 0; i < nodeText.length; i++) {
                if (!/[\s\r\n]/.test(nodeText[i])) seen++;
                if (seen > needed) {
                    startOffset = i;
                    break;
                }
              }
              if (startOffset === -1) startOffset = 0;
            }
          }

          if (startNode !== null && endNode === null) {
          if (currentNormIndex + nodeLen >= endIndexNorm) {
              endNode = textNode;
              const needed = endIndexNorm - currentNormIndex;
              let seen = 0;
              for (let i = 0; i < nodeText.length; i++) {
                if (!/[\s\r\n]/.test(nodeText[i])) seen++;
                if (seen === needed) {
                    endOffset = i + 1;
                    break;
                }
              }
              if (endOffset === -1) endOffset = nodeText.length;
          }
          }
          
          currentNormIndex += nodeLen;
          if (startNode && endNode) break;
      }

      if (startNode && endNode) {
          try {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
              return Array.from(range.getClientRects());
          } catch(e) {
              return [];
          }
      }
      return [];
    };
    // Defer highlighting to next tick to ensure DOM is ready
    const timer = setTimeout(() => {
      const textLayer = textLayerRef.current;
      const rects = findRobustRects(textLayer);
      setHighlights(rects);
    }, 50);

    return () => clearTimeout(timer);
  }, [highlightedText, shouldRender, isActivePage]);


  // 5. Main Rendering Logic (Paint Phase)
  useEffect(() => {
    if (!shouldRender || !dimensions) return; 

    if (Math.abs(renderedScale - scale) < 0.01 && !isLoading && renderedScale !== 0) return;

    let isCancelled = false;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try { 
          renderTaskRef.current.cancel(); 
        } catch(e) {}
        renderTaskRef.current = null;
      }

      setIsLoading(true);
      let page;
      try {
        page = await pdfDocument.getPage(pageNumber);
      } catch (error) {
        if (!isCancelled) setIsLoading(false);
        return;
      }

      if (isCancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          const outputScale = window.devicePixelRatio || 1;
          
          if (canvas.width !== Math.floor(viewport.width * outputScale) || 
              canvas.height !== Math.floor(viewport.height * outputScale)) {
              canvas.width = Math.floor(viewport.width * outputScale);
              canvas.height = Math.floor(viewport.height * outputScale);
              canvas.style.width = Math.floor(viewport.width) + "px";
              canvas.style.height = Math.floor(viewport.height) + "px";
          }

          const transform = outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null;

          const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: viewport,
          };

          const renderTask = page.render(renderContext);
          renderTaskRef.current = renderTask;
          
          try {
            await renderTask.promise;
          } catch (error: any) {}
        }
      }

      if (isCancelled) return;

      // 渲染文本层 (Text Layer)
      // 这是让 PDF 文字可以被选中的核心代码。
      if (textLayerRef.current) {
         const textLayerDiv = textLayerRef.current;
         textLayerDiv.innerHTML = "";
         textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
         textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
         textLayerDiv.style.setProperty('--scale-factor', `${scale}`);

         try {
           const textContent = await page.getTextContent();
           if (isCancelled) return;
           
           await pdfjs.renderTextLayer({
             textContentSource: textContent,
             container: textLayerDiv,
             viewport: viewport,
             textDivs: []
           }).promise;
           
    // console.log("Computed layout blocks:", layoutBlocks);
         } catch(e) {
            console.error("Error rendering text layer", e);
         }
      }

      if (!isCancelled) {
        setRenderedScale(scale);
        setIsLoading(false);
        renderTaskRef.current = null;
      }
    };

    renderPage();
    

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [shouldRender, pdfDocument, pageNumber, scale, dimensions]);

  

  /**
   * 智能文本选择 (Smart Text Selection)
   * Replaced Native Selection with fully custom calculations.
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    // Ignore non-left clicks (e.g. Right Click for Context Menu) to preserve selection
    if (e.button !== 0) return;
// console.log("=====", e.target)
    const textLayer = textLayerRef.current;
    if (!textLayer) return;
    
    // FORCE custom selection logic everywhere
    e.preventDefault(); 
    const MIND = 2;
    console.log("handleMouseDown==", e.clientX, e.clientY)
    let superpositionState_findStartClosestNode = findClosestTextNode(e.clientX, e.clientY, textLayer);
    
    const handleDragSelection = (startX: number, startY: number) => {
      // let startX = e.clientX, startY = e.clientY;
      // const textLayer = textLayerRef.current;
      // let superpositionState_findStartClosestNode = findStartClosestNode(startX, startY, textLayer);
      let isDragging = false;
      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging) {
            const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
            if (dist < MIND) return;
            isDragging = true;
        }
        const layoutBlocks = computeLayoutBlocks(textLayer);
  setLayoutBlocks(layoutBlocks);
        if(window.getSelection().rangeCount === 0) {
          let direction = 0;
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          if(dx >= MIND) direction |= RIGHT;
          if(dx <= -MIND) direction |= LEFT;
          if(dy >= MIND) direction |= DOWN;
          if(dy <= -MIND) direction |= UP;
          let result = superpositionState_findStartClosestNode(true, direction, layoutBlocks);
          if(result && result.node){
   // console.log("=====set start", result.node)
            const range = document.createRange();
            range.setStart(result.node, result.offset);
            range.collapse(true);
            // selection.removeAllRanges();
            window.getSelection().addRange(range);
          } else {
            console.log("next findClosestTextNode")
            superpositionState_findStartClosestNode = findClosestTextNode(ev.clientX, ev.clientY, textLayer);
          }
          
        }
        
        // Dynamic Layer Detection for Cross-Page Selection
        const moveTarget = document.elementFromPoint(ev.clientX, ev.clientY);
        const pageWrapper = (moveTarget as HTMLElement)?.closest('.relative');
        
        let layer = pageWrapper?.querySelector('.textLayer') as HTMLElement;
        if (!layer && textLayer) layer = textLayer; // Fallback to start page if void
  
        if (layer) {
            const result = findClosestTextNode(ev.clientX, ev.clientY, layer)(false, 0, layoutBlocks);
            if (result && result.node) {
              if (window.getSelection().rangeCount > 0) window.getSelection().extend(result.node, result.offset);
            }
        }
      };
  
      const handleMouseUp = () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
          if (!isDragging) {
              // If it was just a click without significant drag, clear the selection
              // window.getSelection()?.removeAllRanges();
              // console.log("Cleared selection on click");
          }
      };
  
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    

    if (e.detail === 2) {
      const result = superpositionState_findStartClosestNode(true, 0, layoutBlocks);
      if (result && result.node) {
        selectWordAtNode(result.node, result.offset);
        // Attach drag listener to allow extending from the word selection
        handleDragSelection(e.clientX, e.clientY);
        return;
      }
    }
        
    // SHIFT CLICK LOGIC: Extend existing selection
    if (e.shiftKey && window.getSelection() && window.getSelection().rangeCount > 0) {
      const result =  findClosestTextNode(e.clientX, e.clientY, textLayer)(true, 0, layoutBlocks);
      console.log("=====shift click extend selection", result)
      if(result && result.node) {
        try {
          window.getSelection().extend(result.node, result.offset);
        } catch (err) {
          // Fallback to normal window.getSelection() if extend fails
          const range = document.createRange();
          range.setStart(result.node, result.offset);
          range.collapse(true);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        }
      }
    } else {
      window.getSelection().removeAllRanges();
      handleDragSelection(e.clientX, e.clientY);
    }
  }

  const width = dimensions ? dimensions.width : 600;
  const height = dimensions ? dimensions.height : 800;

  return (
    <div 
        ref={wrapperRef}
        className="relative bg-white shadow-md my-4 transition-all duration-200 origin-top"
        style={{ 
            width: width, 
            height: height, 
            minHeight: height
        }}
        id={`pdf-page-${pageNumber}`}
        onMouseDown={handleMouseDown}
    >
        {shouldRender && dimensions ? (
            <>
                <canvas ref={canvasRef} className="block" />
                <div ref={textLayerRef} className="textLayer absolute inset-0 origin-top-left" />
                {highlights.map((rect, i) => {
                    const rel = textLayerRef.current ? getRelativeRect(rect, textLayerRef.current) : rect;
                    return (
                        <div 
                            key={i}
                            className="absolute pointer-events-none z-10 mix-blend-multiply"
                            style={{
                                top: rel.top,
                                left: rel.left,
                                width: rel.width,
                                height: rel.height,
                                backgroundColor: 'rgba(253, 224, 71, 0.5)'
                            }}
                        />
                    );
                })}

                {layoutBlocks.map((rect, i) => {
                  // const rel  = rect;
                  // console.log("===textLayerRef.current", textLayerRef.current)
                  // const rel = textLayerRef.current ? getRelativeRect(rect, textLayerRef.current) : rect;
                  const rel = getRelativeRect(rect, textLayerRef.current);
                  return (
                      <div 
                          key={rect}
                          className="absolute pointer-events-none z-10 mix-blend-multiply"
                          style={{
                              top: rel.top,
                              left: rel.left,
                              width: rel.width,
                              height: rel.height,
                              border: '1px solid red',
                              // backgroundColor: 'rgba(253, 224, 71, 0.5)'
                          }}
                      />
                  );
                })}
              
                
                 
            </>
        ) : (
             <div className="flex items-center justify-center h-full bg-slate-50 text-slate-300">
                <span className="text-4xl font-bold opacity-20">{pageNumber}</span>
             </div>
        )}
        
        {isLoading && shouldRender && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <Loader2Icon className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        )}
    </div>
  );
};


export const PDFViewer: React.FC<PDFViewerProps> = ({ 
  pdfDocument, 
  currentPage, 
  scale,
  onTextExtracted,
  onPageChange,
  onNavigatePage,
  highlightedText
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const mostVisiblePageRef = useRef(1);
  const [preloadedPages, setPreloadedPages] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (pdfDocument) {
      onPageChange(pdfDocument.numPages);
      setPreloadedPages(new Set());
    }
  }, [pdfDocument, onPageChange]);

  useEffect(() => {
    if (!pdfDocument) return;
    const timer = setTimeout(() => {
        setPreloadedPages(prev => {
            const newSet = new Set(prev);
            const start = Math.max(1, currentPage - 5);
            const end = Math.min(pdfDocument.numPages, currentPage + 5);
            let changed = false;
            for (let i = start; i <= end; i++) {
                if (!newSet.has(i)) {
                    newSet.add(i);
                    changed = true;
                }
            }
            return changed ? newSet : prev;
        });
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentPage, pdfDocument]);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + (containerRect.height / 2);

    let activePage = mostVisiblePageRef.current;
    let minDistance = Infinity;

    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        if (!child.id.startsWith('pdf-page-')) continue;
        const rect = child.getBoundingClientRect();
        if (rect.top > containerRect.bottom) break;
        if (rect.bottom < containerRect.top) continue;
        const pageCenterY = rect.top + (rect.height / 2);
        const distance = Math.abs(pageCenterY - centerY);

        if (distance < minDistance) {
            minDistance = distance;
            activePage = parseInt(child.id.replace('pdf-page-', ''), 10);
        }
    }

    if (activePage !== mostVisiblePageRef.current) {
        mostVisiblePageRef.current = activePage;
        onNavigatePage(activePage);
    }
  }, [onNavigatePage]);


  useEffect(() => {
    if (!pdfDocument || !containerRef.current) return;
    if (currentPage !== mostVisiblePageRef.current) {
        isAutoScrolling.current = true;
        mostVisiblePageRef.current = currentPage;
        const pageEl = document.getElementById(`pdf-page-${currentPage}`);
        if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        const timeout = setTimeout(() => {
            isAutoScrolling.current = false;
        }, 500); 
        return () => clearTimeout(timeout);
    }
  }, [currentPage, pdfDocument]);


  if (!pdfDocument) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <p>No document loaded</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-slate-200 flex flex-col items-center p-8 scroll-smooth"
    >
      {Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1).map((pageNum) => (
        <PDFPage
            key={pageNum}
            pageNumber={pageNum}
            pdfDocument={pdfDocument}
            scale={scale}
            highlightedText={highlightedText}
            onTextReady={(_, text) => {
                if (pageNum === currentPage) {
                    onTextExtracted(text);
                }
            }}
            isActivePage={pageNum === currentPage}
            forcePreload={preloadedPages.has(pageNum)}
        />
      ))}
    </div>
  );
};
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PDFDocumentProxy } from '../types';
import { extractTextFromPage, pdfjs } from '../services/pdfService';
import { Loader2 as Loader2Icon } from 'lucide-react';

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

const getSelectionRect = () => {
  const selection = window.getSelection();
  if( selection && selection.rangeCount > 0) {
    return selection.getRangeAt(0).getBoundingClientRect();
  }
  return null;
}

/**
 * Helper: Find closest text node with Strict Row Priority.
 * Prevents selecting adjacent lines when in margins.
 */
const findClosestTextNode = (clientX: number, clientY: number, layer: HTMLElement) => {
  const spans = Array.from(layer.children) as HTMLElement[];
  if (spans.length === 0) return null;

  // Helper to handle void elements (like <br>) or empty spans
  // If firstChild (TextNode) is null, return the element itself with offset 0.
  const getSafeResult = (span: HTMLElement, atEnd: boolean) => {
    return { 
      node: span.firstChild, 
      offset: atEnd ? (span.textContent?.length || 0) : 0 
    };
  };

  // 1. Identify "Visual Row"
  // Strict vertical check: Cursor MUST be between top and bottom of the span
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

      // Left Margin -> Start of First Span
      if (clientX < firstRect.left) {
          return getSafeResult(firstSpan, false);
      }
      
      // Right Margin -> End of Last Span
      if (clientX > lastRect.right) {
        const r = getSelectionRect();
        if (r && r.left > lastRect.right) {
          return null;
        }
        return getSafeResult(lastSpan, true);
      }

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
            return getSafeResult(span, isAtEnd);
        }

        // Gutter between this and next
        if (i < rowSpans.length - 1) {
          const r = getSelectionRect();
          if(r) {
            const nextSpan = rowSpans[i+1];
            const nextR = nextSpan.getBoundingClientRect();
            
            if (clientX > r.right && clientX < nextR.left) {
              const distLeft = clientX - r.right;
              const distRight = nextR.left - clientX;
              if (distLeft <= distRight) {
                  return getSafeResult(span, true);
              } else {
                  return getSafeResult(nextSpan, false);
              }
            }
          }
        }
      }
  } 
  return null;
};

const findStartClosestSpan = (clientX: number, clientY: number, layer: HTMLElement) => {
  const res = findClosestTextNode(clientX, clientY, layer);
  if(res && res.node) return res;

  const spans = Array.from(layer.children) as HTMLElement[];
  if (spans.length === 0) return null;

  let span;
  let minDist = Infinity;
  for (const s of spans) {
    if(s.firstChild == null) continue;
    const r = s.getBoundingClientRect();
    const x = r.left - clientX ;
    const y = r.top + r.height / 2 - clientY ;
    
    if (x >= 0 && y >= 0){
      // x 权重小
      const dist = x * x * 0.25 + y * y;
      if (dist < minDist) {
          minDist = dist;
          span = s;
      }
    }
  }
  if (span) {
      return { node: span.firstChild, offset: 0 };
  }
  return null;
}

const getRelativeRect = (rect: DOMRect, layer: HTMLElement) => {
  const layerRect = layer.getBoundingClientRect();
  return {
      top: rect.top - layerRect.top,
      left: rect.left - layerRect.left,
      width: rect.width,
      height: rect.height
  };
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

    const textLayer = textLayerRef.current;
    
    // Defer highlighting to next tick to ensure DOM is ready
    const timer = setTimeout(() => {
        const findRobustRects = () => {
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

        const rects = findRobustRects();
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
         } catch(e) {}
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

    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    // FORCE custom selection logic everywhere
    e.preventDefault(); 

    const result = findStartClosestSpan(e.clientX, e.clientY, textLayer);
    
    if (result && result.node) {
        const selection = window.getSelection();
        
        // SHIFT CLICK LOGIC: Extend existing selection
        if (e.shiftKey && selection && selection.rangeCount > 0) {
            try {
                selection.extend(result.node, result.offset);
            } catch (err) {
                // Fallback to normal selection if extend fails
                const range = document.createRange();
                range.setStart(result.node, result.offset);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // NORMAL CLICK LOGIC: Start new selection
            const range = document.createRange();
            range.setStart(result.node, result.offset);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }

        const startX = e.clientX;
        const startY = e.clientY;
        let isDragging = false;

        const handleMouseMove = (ev: MouseEvent) => {
             if (!isDragging) {
                 const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
                 if (dist < 5) return;
                 isDragging = true;
             }

             // Dynamic Layer Detection for Cross-Page Selection
             const moveTarget = document.elementFromPoint(ev.clientX, ev.clientY);
             const pageWrapper = (moveTarget as HTMLElement)?.closest('.relative');
             
             let layer = pageWrapper?.querySelector('.textLayer') as HTMLElement;
             if (!layer && textLayer) layer = textLayer; // Fallback to start page if void

             if (layer) {
                 const result = findClosestTextNode(ev.clientX, ev.clientY, layer);
                 if (result && result.node) {
                   window.getSelection()?.extend(result.node, result.offset);
                 }
             }
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (!isDragging) {
                // Keep cursor at clicked position (caret), don't remove range
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
  };

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
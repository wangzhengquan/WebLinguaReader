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
  // Initialized by forcePreload, updated by IntersectionObserver or prop change
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
    // If already rendering (due to preload or previous visit), we don't need to observe
    if (shouldRender) return;

    const element = wrapperRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldRender(true);
            observer.disconnect(); // Once triggered, we stay rendered
          }
        });
      },
      {
        root: null, // viewport
        // Load pages 2 screens away
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

    // Skip re-render if scale hasn't changed effectively
    if (Math.abs(renderedScale - scale) < 0.01 && !isLoading && renderedScale !== 0) return;

    let isCancelled = false;

    const renderPage = async () => {
      // Cancel previous task if any
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
          } catch (error: any) {
            // Cancelled exception is expected
          }
        }
      }

      if (isCancelled) return;

      // 渲染文本层 (Text Layer)
      // 这是让 PDF 文字可以被选中的核心代码。
      // 它在 Canvas 上方覆盖一层透明的 HTML 文本，与图片中的文字完全重合。
      // 用户选中的其实是这层透明的 HTML 文本。
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
         } catch(e) {
           // Text layer errors ignored
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

  const getRelativeRect = (rect: DOMRect) => {
    if (!textLayerRef.current) return rect;
    const layerRect = textLayerRef.current.getBoundingClientRect();
    return {
        top: rect.top - layerRect.top,
        left: rect.left - layerRect.left,
        width: rect.width,
        height: rect.height
    };
  };

  /**
   * 智能文本选择 (Smart Text Selection)
   * 
   * PDF.js 的渲染层通常包含大量的空白区域（Margins/Padding）。
   * 默认情况下，在这些空白区域点击或拖拽无法选中文本。
   * 
   * 此函数实现了以下功能：
   * 1. 点击定位：点击空白处时，自动找到最近的文本节点。
   * 2. 拖拽选择：允许从页边距或行间距开始拖拽选择文本。
   * 3. 智能吸附：根据鼠标位置判断是选中当前行的开头还是结尾。
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // If user clicked directly on text, let browser handle it
    if (target.tagName === 'SPAN') return;

    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    const x = e.clientX;
    const y = e.clientY;

    const spans = Array.from(textLayer.children) as HTMLElement[];
    if (spans.length === 0) return;

    let bestSpan: HTMLElement | null = null;
    
    // Improved "Best Span" search for multi-column layouts using Distance Priority
    const yBuffer = 10;
    const sameLineSpans = spans.filter(s => {
        const r = s.getBoundingClientRect();
        return y >= (r.top - yBuffer) && y <= (r.bottom + yBuffer);
    });

    if (sameLineSpans.length > 0) {
        // Find closest span on the same line (left or right)
        const leftSpans = sameLineSpans.filter(s => s.getBoundingClientRect().right <= x);
        const rightSpans = sameLineSpans.filter(s => s.getBoundingClientRect().left >= x);

        let bestLeft: HTMLElement | null = null;
        let bestRight: HTMLElement | null = null;

        if (leftSpans.length > 0) {
            bestLeft = leftSpans.reduce((p, c) => c.getBoundingClientRect().right > p.getBoundingClientRect().right ? c : p);
        }
        if (rightSpans.length > 0) {
            bestRight = rightSpans.reduce((p, c) => c.getBoundingClientRect().left < p.getBoundingClientRect().left ? c : p);
        }

        if (bestLeft && bestRight) {
            const distLeft = x - bestLeft.getBoundingClientRect().right;
            const distRight = bestRight.getBoundingClientRect().left - x;
            bestSpan = (distLeft <= distRight) ? bestLeft : bestRight;
        } else if (bestLeft) {
            bestSpan = bestLeft;
        } else if (bestRight) {
            bestSpan = bestRight;
        }

    } else {
        // No text on this line. Find closest below (Fallback)
        let minDist = Infinity;
        for (const s of spans) {
            const r = s.getBoundingClientRect();
            // Only look downwards
            if (r.top > y) {
                const dy = r.top - y;
                const dx = Math.abs(r.left - x);
                // Weighted score: Y distance is more important
                const score = dy * 10 + dx; 
                if (score < minDist) {
                    minDist = score;
                    bestSpan = s;
                }
            }
        }
    }

    if (bestSpan && bestSpan.firstChild) {
        e.preventDefault(); 
        
        const selection = window.getSelection();
        const range = document.createRange();
        
        // Smart Anchor:
        // If we picked a span to the right (Left Margin click), start at 0.
        // If we picked a span to the left (Right Margin click), start at end.
        const r = bestSpan.getBoundingClientRect();
        const offset = (r.left >= x) ? 0 : (bestSpan.textContent?.length || 0);

        range.setStart(bestSpan.firstChild, offset);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);

        const startX = e.clientX;
        const startY = e.clientY;
        let isDragging = false;

        const handleMouseMove = (ev: MouseEvent) => {
             // Only consider it a drag if moved more than 5 pixels
             if (!isDragging) {
                 const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
                 if (dist < 5) return;
                 isDragging = true;
             }

             const moveTarget = document.elementFromPoint(ev.clientX, ev.clientY);
             if (!moveTarget) return;

             let extendNode: Node | null = null;
             let offset = 0;

             // Optimization: If directly hovering a text span, snap to it immediately
             if (moveTarget.tagName === 'SPAN' && moveTarget.parentElement?.classList.contains('textLayer')) {
                 extendNode = moveTarget.firstChild;
                 const r = moveTarget.getBoundingClientRect();
                 if (ev.clientX > r.left + r.width/2) {
                     offset = moveTarget.textContent?.length || 0;
                 }
             } else {
                 // Smart Search in Margin/Whitespace
                 const pageWrapper = moveTarget.closest('.relative');
                 const layer = pageWrapper?.querySelector('.textLayer');
                 if (layer) {
                     const layerSpans = Array.from(layer.children) as HTMLElement[];
                     
                     // Row Priority Logic with Multi-column Support:
                     const lineSpans = layerSpans.filter(s => {
                        const r = s.getBoundingClientRect();
                        return ev.clientY >= (r.top - 5) && ev.clientY <= (r.bottom + 5);
                     });

                     let closest: HTMLElement | null = null;

                     if (lineSpans.length > 0) {
                         // We are on a line. 
                         // Use distance priority to choose between columns
                         const leftCandidates = lineSpans.filter(s => s.getBoundingClientRect().right <= ev.clientX);
                         const rightCandidates = lineSpans.filter(s => s.getBoundingClientRect().left >= ev.clientX);

                         let bestLeft: HTMLElement | null = null;
                         let bestRight: HTMLElement | null = null;

                         if (leftCandidates.length > 0) {
                             bestLeft = leftCandidates.reduce((p, c) => c.getBoundingClientRect().right > p.getBoundingClientRect().right ? c : p);
                         }
                         if (rightCandidates.length > 0) {
                             bestRight = rightCandidates.reduce((p, c) => c.getBoundingClientRect().left < p.getBoundingClientRect().left ? c : p);
                         }

                         if (bestLeft && bestRight) {
                             const distLeft = ev.clientX - bestLeft.getBoundingClientRect().right;
                             const distRight = bestRight.getBoundingClientRect().left - ev.clientX;
                             closest = (distLeft <= distRight) ? bestLeft : bestRight;
                         } else if (bestLeft) {
                             closest = bestLeft;
                         } else if (bestRight) {
                             closest = bestRight;
                         }

                     } else {
                         // Fallback: Vertical gap. Find closest by Euclidean distance.
                         let minDist = Infinity;
                         for (const s of layerSpans) {
                             const r = s.getBoundingClientRect();
                             const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right);
                             const dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
                             const dist = Math.sqrt(dx*dx + dy*dy);
                             if (dist < minDist) {
                                 minDist = dist;
                                 closest = s;
                             }
                         }
                     }

                     if (closest && closest.firstChild) {
                         extendNode = closest.firstChild;
                         const r = closest.getBoundingClientRect();
                         // If mouse is to the right or below the span, select to end
                         if (ev.clientX > r.right || ev.clientY > r.bottom) {
                             offset = closest.textContent?.length || 0;
                         }
                     }
                 }
             }

             if (extendNode) {
                 window.getSelection()?.extend(extendNode, offset);
             }
        };

        const handleMouseUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            
            if (!isDragging) {
                // If it was just a click without significant drag, clear the selection
                window.getSelection()?.removeAllRanges();
                return;
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
            minHeight: height // Enforce min height
        }}
        id={`pdf-page-${pageNumber}`}
        onMouseDown={handleMouseDown}
    >
        {shouldRender && dimensions ? (
            <>
                <canvas ref={canvasRef} className="block" />
                <div ref={textLayerRef} className="textLayer absolute inset-0 origin-top-left" />
                {highlights.map((rect, i) => {
                    const rel = getRelativeRect(rect);
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

  // Handle total page count and reset preload on new doc
  useEffect(() => {
    if (pdfDocument) {
      onPageChange(pdfDocument.numPages);
      setPreloadedPages(new Set());
    }
  }, [pdfDocument, onPageChange]);

  // Preload Logic: Wait 5s after page change, then preload +/- 5 pages
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

  // Handle Scroll to detect active page
  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + (containerRect.height / 2);

    let activePage = mostVisiblePageRef.current;
    let minDistance = Infinity;

    const children = container.children;
    
    // Efficiently find closest page to center
    for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        if (!child.id.startsWith('pdf-page-')) continue;

        const rect = child.getBoundingClientRect();
        
        // Optimization: Stop if we've passed the view
        if (rect.top > containerRect.bottom) break;
        // Skip if way above
        if (rect.bottom < containerRect.top) continue;

        // Distance from page center to viewport center
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


  // Programmatic Scroll (Navigation buttons / Outline / Search)
  useEffect(() => {
    if (!pdfDocument || !containerRef.current) return;

    // Check if the requested page is different from what we think is visible
    if (currentPage !== mostVisiblePageRef.current) {
        
        isAutoScrolling.current = true;
        mostVisiblePageRef.current = currentPage; // Sync immediately
        
        const pageEl = document.getElementById(`pdf-page-${currentPage}`);
        if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }

        // Release lock after scroll settles
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
                // We could optimize this to only update when page settles
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
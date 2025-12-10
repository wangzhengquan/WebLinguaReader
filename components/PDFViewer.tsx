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

      // Render Text Layer
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

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'SPAN') return;

    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    const x = e.clientX;
    const y = e.clientY;

    const spans = Array.from(textLayer.children) as HTMLElement[];
    if (spans.length === 0) return;

    let bestSpan: HTMLElement | null = null;
    
    // Find closest span to cursor logic
    for (const span of spans) {
        const r = span.getBoundingClientRect();
        const isBelow = r.top > y;
        const isSameLineAndRight = (r.bottom >= y && r.top <= y) && r.left > x;

        if (isBelow || isSameLineAndRight) {
            bestSpan = span;
            break; 
        }
    }

    if (bestSpan && bestSpan.firstChild) {
        e.preventDefault(); 
        
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(bestSpan.firstChild, 0);
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

             if (moveTarget.tagName === 'SPAN' && moveTarget.parentElement?.classList.contains('textLayer')) {
                 extendNode = moveTarget.firstChild;
                 const r = moveTarget.getBoundingClientRect();
                 if (ev.clientX > r.left + r.width/2) {
                     offset = moveTarget.textContent?.length || 0;
                 }
             } else {
                 const pageWrapper = moveTarget.closest('.relative');
                 const layer = pageWrapper?.querySelector('.textLayer');
                 if (layer) {
                     const layerSpans = Array.from(layer.children) as HTMLElement[];
                     let minDist = Infinity;
                     let closest = null;
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
                     if (closest && closest.firstChild) {
                         extendNode = closest.firstChild;
                         const r = closest.getBoundingClientRect();
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
                // This prevents accidentally selecting large chunks of text when clicking margins
                window.getSelection()?.removeAllRanges();
                return;
            }

            const upTarget = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement;
            if (upTarget && upTarget.tagName !== 'SPAN') {
                const pageWrapper = upTarget.closest('.relative');
                const layer = pageWrapper?.querySelector('.textLayer');
                if (layer) {
                    const layerSpans = Array.from(layer.children) as HTMLElement[];
                    // Logic to find end text node if released in whitespace
                    for (let i = layerSpans.length - 1; i >= 0; i--) {
                        const s = layerSpans[i];
                        const r = s.getBoundingClientRect();
                        const isAbove = r.bottom < ev.clientY;
                        const isSameLineAndLeft = (r.bottom >= ev.clientY && r.top <= ev.clientY) && r.right < ev.clientX;
                        
                        if (isAbove || isSameLineAndLeft) {
                            if (s.firstChild) {
                                window.getSelection()?.extend(s.firstChild, s.textContent?.length || 0);
                            }
                            break;
                        }
                    }
                }
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
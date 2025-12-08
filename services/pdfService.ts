import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy, PDFOutlineItem } from '../types';

// Handle potential default export structure from different CDNs/bundlers
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Initialize worker with matching version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export { pdfjs };

export const loadPDF = async (file: File): Promise<PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  return loadingTask.promise as unknown as Promise<PDFDocumentProxy>;
};

export const extractTextFromPage = async (page: PDFPageProxy): Promise<string> => {
  try {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const height = viewport.height;
    const width = viewport.width;
    
    // Heuristic filtering for Headers, Footers, and Marginalia
    // PDF Coordinates: (0,0) is bottom-left. Y increases upwards.
    
    // Exclude top/bottom 7.5% (Headers/Footers)
    const headerThreshold = height * 0.925; 
    const footerThreshold = height * 0.075;

    // Exclude left/right 5% (Marginalia/Side page numbers)
    const leftMarginLimit = width * 0.05;
    const rightMarginLimit = width * 0.95;

    // Filter items
    const items = textContent.items.filter((item: any) => {
      const tx = item.transform;
      if (!tx || tx.length < 6) return true; // Keep if no coordinate info
      
      const x = tx[4];
      const y = tx[5];
      
      // Filter Footer (Low Y)
      if (y < footerThreshold) return false;
      
      // Filter Header (High Y)
      if (y > headerThreshold) return false;

      // Filter Side Marginalia (Extreme X)
      if (x < leftMarginLimit || x > rightMarginLimit) return false;
      
      return true;
    });

    // Sort items to ensure correct reading order: Top-to-Bottom, Left-to-Right
    // PDF text stream is not guaranteed to be in visual order.
    items.sort((a: any, b: any) => {
      const y1 = a.transform[5];
      const y2 = b.transform[5];
      const x1 = a.transform[4];
      const x2 = b.transform[4];
      
      // If items are roughly on the same line (within 10px tolerance), sort by X
      if (Math.abs(y1 - y2) < 10) {
        return x1 - x2;
      }
      // Otherwise sort by Y descending (Top of page first)
      return y2 - y1;
    });

    // Join with spaces. 
    // Note: This simple join might merge columns incorrectly if not handled by sort, 
    // but top-to-bottom sort generally handles standard layouts well.
    return items.map((item: any) => item.str).join(' ');
  } catch (e) {
    console.error("Error extracting text", e);
    return "";
  }
};

export const getPDFOutline = async (doc: PDFDocumentProxy): Promise<PDFOutlineItem[]> => {
  try {
    const outline = await doc.getOutline();
    return outline || [];
  } catch (e) {
    console.error("Error getting outline", e);
    return [];
  }
};

export const resolvePageFromDest = async (doc: PDFDocumentProxy, dest: string | any[]): Promise<number> => {
  try {
    let explicitDest = dest;
    
    if (typeof dest === 'string') {
      explicitDest = await doc.getDestination(dest);
    }

    if (!Array.isArray(explicitDest) || explicitDest.length === 0) {
      return -1;
    }

    const ref = explicitDest[0];
    const pageIndex = await doc.getPageIndex(ref);
    return pageIndex + 1; // Convert 0-based index to 1-based page number
  } catch (e) {
    console.error("Error resolving destination", e);
    return -1;
  }
};

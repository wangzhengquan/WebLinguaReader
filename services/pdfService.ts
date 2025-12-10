import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy, PDFOutlineItem } from '../types';

// Handle potential default export structure from different CDNs/bundlers
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// 配置 PDF.js 的后台工作线程 (Web Worker)。
// 作用：开启多线程以提升性能，将耗时的 PDF 解析任务放到后台线程运行，防止主线程卡顿。
// 注意：版本号 (3.11.174) 必须与主包 pdfjs-dist 的版本完全一致，否则会导致加载失败。
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export { pdfjs };

/**
 * 加载 PDF 文件。
 * 将浏览器 File 对象转换为 ArrayBuffer，并使用 pdfjs 获取文档代理对象。
 * @param file 用户上传的文件对象
 * @returns PDFDocumentProxy Promise
 */
export const loadPDF = async (file: File): Promise<PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  return loadingTask.promise as unknown as Promise<PDFDocumentProxy>;
};

/**
 * 从指定 PDF 页面提取纯文本。
 * 包含两个主要处理逻辑：
 * 1. 过滤：基于坐标去除页眉、页脚和页边距内容（通常是页码或无关信息）。
 * 2. 排序：基于 Y 轴（自上而下）和 X 轴（自左向右）对文本块重新排序，以还原人类阅读顺序。
 * @param page PDFPageProxy 对象
 * @returns 处理后的页面文本字符串
 */
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

/**
 * 获取 PDF 文档的目录大纲结构。
 * @param doc PDFDocumentProxy 文档对象
 * @returns 目录项数组（树形结构）
 */
export const getPDFOutline = async (doc: PDFDocumentProxy): Promise<PDFOutlineItem[]> => {
  try {
    const outline = await doc.getOutline();
    return outline || [];
  } catch (e) {
    console.error("Error getting outline", e);
    return [];
  }
};

/**
 * 解析跳转目标。
 * 将大纲项或链接中的 dest 属性（可能是字符串 ID 或数组引用）转换为具体的页码。
 * @param doc PDFDocumentProxy 文档对象
 * @param dest 目标位置描述符
 * @returns 页码 (1-based index)，如果解析失败返回 -1
 */
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
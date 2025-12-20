export interface Message {
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  getOutline: () => Promise<PDFOutlineItem[]>;
  getDestination: (id: string) => Promise<any[]>;
  getPageIndex: (ref: any) => Promise<number>;
}

export interface PDFOutlineItem {
  title: string;
  dest?: string | any[];
  items: PDFOutlineItem[];
  // Some pdfjs versions use 'url' or 'action' but standard outline is usually title/dest/items
}

export interface PDFPageProxy {
  pageNumber: number;
  getViewport: (params: { scale: number }) => PDFPageViewport;
  render: (params: any) => any;
  getTextContent: () => Promise<PDFTextContent>;
}

export interface PDFPageViewport {
  width: number;
  height: number;
  scale: number;
}

export interface PDFTextContent {
  items: Array<{ str: string }>;
}

export enum ChatState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR'
}

export interface Point {
  x: number;
  y: number;
}

const UP = 1, DOWN = 1 << 1, LEFT = 1 << 2, RIGHT = 1 << 3;

export {
  UP,
  DOWN,
  LEFT,
  RIGHT
}

 
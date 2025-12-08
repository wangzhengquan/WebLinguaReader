import React, { useState } from 'react';
import { ChevronRight, ChevronDown, List } from 'lucide-react';
import { PDFOutlineItem } from '../types';

interface OutlinePanelProps {
  outline: PDFOutlineItem[];
  onNavigate: (dest: string | any[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

const OutlineItem: React.FC<{ 
  item: PDFOutlineItem; 
  onNavigate: (dest: string | any[]) => void;
  depth?: number 
}> = ({ item, onNavigate, depth = 0 }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.items && item.items.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.dest) {
      onNavigate(item.dest);
    } else if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-1.5 px-2 hover:bg-slate-100 cursor-pointer rounded-md text-sm text-slate-700 transition-colors ${
          depth > 0 ? 'ml-4' : ''
        }`}
        onClick={handleClick}
      >
        <span 
          className={`mr-1 p-0.5 hover:bg-slate-200 rounded ${!hasChildren ? 'invisible' : ''}`}
          onClick={handleToggle}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-slate-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-500" />
          )}
        </span>
        <span className="truncate flex-1" title={item.title}>
          {item.title}
        </span>
      </div>
      {hasChildren && expanded && (
        <div className="border-l border-slate-200 ml-[1.125rem]">
          {item.items.map((child, idx) => (
            <OutlineItem key={idx} item={child} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const OutlinePanel: React.FC<OutlinePanelProps> = ({ outline, onNavigate, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="w-64 md:w-72 border-r border-slate-200 bg-white flex flex-col h-full absolute md:relative z-30 shadow-xl md:shadow-none">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <List className="w-4 h-4" />
          <h3>Table of Contents</h3>
        </div>
        {/* Mobile close button */}
        <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600">
          <span className="sr-only">Close</span>
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-300">
        {outline.length > 0 ? (
          outline.map((item, idx) => (
            <OutlineItem key={idx} item={item} onNavigate={onNavigate} />
          ))
        ) : (
          <div className="text-center p-8 text-slate-400 text-sm">
            No outline available for this document.
          </div>
        )}
      </div>
    </div>
  );
};
import React from 'react';
import { Globe as GlobeIcon, X as XIcon, Loader2 as Loader2Icon } from 'lucide-react';

interface TranslationPopupProps {
  isOpen: boolean;
  y: number;
  targetLanguage: string;
  translatedText: string;
  isLoading: boolean;
  onClose: () => void;
}

export const TranslationPopup = React.forwardRef<HTMLDivElement, TranslationPopupProps>(({
  isOpen,
  y,
  targetLanguage,
  translatedText,
  isLoading,
  onClose
}, ref) => {
  if (!isOpen) return null;

  return (
    <div 
      ref={ref}
      className="fixed z-[60] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 w-[800px] max-w-[95vw] left-1/2 -translate-x-1/2"
      style={{ top: y }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
          <GlobeIcon className="w-4 h-4" />
          <span>Translate to {targetLanguage}</span>
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-4 max-h-60 overflow-y-auto">
        <div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Translating...
            </div>
          ) : (
            <p className="text-sm text-slate-800 leading-relaxed font-medium">
              {translatedText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

TranslationPopup.displayName = 'TranslationPopup';
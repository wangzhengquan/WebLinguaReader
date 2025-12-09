import React, { useState, useEffect, useRef } from 'react';
import { Upload, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MessageSquare, FileText, Globe, X, Loader2, PanelLeftClose, PanelLeftOpen, Headphones, Square, Settings } from 'lucide-react';
import { Button } from './components/Button';
import { PDFViewer } from './components/PDFViewer';
import { ChatPanel } from './components/ChatPanel';
import { OutlinePanel } from './components/OutlinePanel';
import { loadPDF, getPDFOutline, resolvePageFromDest } from './services/pdfService';
import { PDFDocumentProxy, PDFOutlineItem } from './types';
import * as geminiService from './services/geminiService';

const LANGUAGES = [
  "Simplified Chinese",
  "English",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Russian",
  "Portuguese",
  "Italian"
];

interface TranslationPopupState {
  isOpen: boolean;
  y: number;
  originalText: string;
  translatedText: string;
  isLoading: boolean;
}

function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [outline, setOutline] = useState<PDFOutlineItem[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  
  // Initialize scale from localStorage or default to 1.0
  const [scale, setScale] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gemini_pdf_scale');
      const parsed = saved ? parseFloat(saved) : 1.0;
      return isNaN(parsed) ? 1.0 : parsed;
    }
    return 1.0;
  });

  const [currentText, setCurrentText] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Reading (TTS) State
  const [isReading, setIsReading] = useState(false);
  const [readingSentence, setReadingSentence] = useState<string | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const readingQueueRef = useRef<string[]>([]);
  const readingIndexRef = useRef(0);
  const readingTimeoutRef = useRef<any>(null);
  
  // TTS Settings
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Translation State
  // Initialize target language from localStorage
  const [targetLanguage, setTargetLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gemini_pdf_target_language') || "Simplified Chinese";
    }
    return "Simplified Chinese";
  });

  const [translation, setTranslation] = useState<TranslationPopupState>({
    isOpen: false,
    y: 0,
    originalText: "",
    translatedText: "",
    isLoading: false,
  });
  const translationRef = useRef<HTMLDivElement>(null);

  // Toolbar Input State
  const [zoomInput, setZoomInput] = useState(() => String(Math.round(scale * 100)));
  const [isZoomFocused, setIsZoomFocused] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [isPageFocused, setIsPageFocused] = useState(false);

  // Persist scale to localStorage
  useEffect(() => {
    localStorage.setItem('gemini_pdf_scale', scale.toString());
  }, [scale]);

  // Persist targetLanguage to localStorage
  useEffect(() => {
    localStorage.setItem('gemini_pdf_target_language', targetLanguage);
  }, [targetLanguage]);

  // Sync inputs with state when not focused
  useEffect(() => {
    if (!isZoomFocused) {
      setZoomInput(String(Math.round(scale * 100)));
    }
  }, [scale, isZoomFocused]);

  useEffect(() => {
    if (!isPageFocused) {
      setPageInput(String(currentPage));
    }
  }, [currentPage, isPageFocused]);

  // Load voices and select a good default
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Try to find a good default voice (Google or Natural)
      // We prioritize Google US English or similar if no preference is saved
      if (!selectedVoice && availableVoices.length > 0) {
        const preferred = availableVoices.find(v => 
          (v.name.includes("Google") && v.lang.startsWith("en")) || 
          v.name.includes("Natural")
        );
        setSelectedVoice(preferred || availableVoices[0]);
      }
    };

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => { window.speechSynthesis.onvoiceschanged = null; }
  }, [selectedVoice]);

  // Close popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (translationRef.current && !translationRef.current.contains(event.target as Node)) {
        setTranslation(prev => ({ ...prev, isOpen: false }));
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update popup position on scroll
  useEffect(() => {
    const updatePosition = () => {
      if (translation.isOpen) {
         const selection = window.getSelection();
         if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Only update if visible
            if (rect.width > 0 && rect.height > 0) {
                // Calculate new Y (Center X handled by CSS)
                const newY = rect.bottom + 10;
                setTranslation(prev => ({ ...prev, y: newY }));
            } else {
                // Optionally close if scrolled off screen, but keeping it open is fine too
                // setTranslation(prev => ({ ...prev, isOpen: false }));
            }
         }
      }
    };

    // Capture true is essential to catch scroll events from the PDF container div
    window.addEventListener('scroll', updatePosition, { capture: true }); 
    window.addEventListener('resize', updatePosition);
    return () => {
        window.removeEventListener('scroll', updatePosition, { capture: true });
        window.removeEventListener('resize', updatePosition);
    };
  }, [translation.isOpen]);

  // Stop reading when page changes
  useEffect(() => {
    stopReading();
  }, [currentPage, pdfDoc]);

  // Handle Tab key for translation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (selectedText && selectedText.length > 0) {
          e.preventDefault(); // Prevent default tab focus switching
          
          const range = selection!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const y = rect.bottom + 10;

          setTranslation({
            isOpen: true,
            y,
            originalText: selectedText,
            translatedText: "",
            isLoading: true,
          });

          try {
            const result = await geminiService.translateText(selectedText, targetLanguage);
            setTranslation(prev => ({
              ...prev,
              isLoading: false,
              translatedText: result
            }));
          } catch (error) {
            setTranslation(prev => ({
              ...prev,
              isLoading: false,
              translatedText: "Error: Could not translate."
            }));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [targetLanguage]);

  // File Upload Handler
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      await processFile(file);
    } else if (file) {
      alert("Please select a valid PDF file.");
    }
  };

  const processFile = async (file: File) => {
    try {
        const doc = await loadPDF(file);
        setPdfDoc(doc);
        setFileName(file.name);
        setCurrentPage(1);
        setTotalPages(doc.numPages);
        
        // Fetch outline
        const docOutline = await getPDFOutline(doc);
        setOutline(docOutline);
        setIsOutlineOpen(docOutline.length > 0);

      } catch (error) {
        console.error("Failed to load PDF", error);
        alert("Failed to load PDF. Please try another file.");
      }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
       await processFile(file);
    }
  };

  // Navigation Handlers
  const changePage = (delta: number) => {
    setCurrentPage(prev => Math.min(Math.max(1, prev + delta), totalPages));
  };

  const handlePageCommit = () => {
    let val = parseInt(pageInput.replace(/\D/g, ''), 10);
    if (isNaN(val)) {
      setPageInput(String(currentPage));
      return;
    }
    val = Math.min(Math.max(1, val), totalPages);
    setCurrentPage(val);
    setPageInput(String(val));
    setIsPageFocused(false);
  };
  
  // Callback from PDFViewer when scroll changes
  const handlePageChangeFromScroll = (page: number) => {
      // Only update if different to avoid render loops, but keep sync
      if (page !== currentPage) {
          setCurrentPage(page);
      }
  };

  const changeScale = (delta: number) => {
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 3.0));
  };

  const handleZoomCommit = () => {
    let val = parseInt(zoomInput.replace(/\D/g, ''), 10);
    if (isNaN(val)) {
      setZoomInput(String(Math.round(scale * 100)));
      return;
    }
    // Clamp between 50 and 300
    val = Math.min(Math.max(50, val), 300);
    setScale(val / 100);
    setZoomInput(String(val));
    setIsZoomFocused(false);
  };

  const handleOutlineNavigate = async (dest: string | any[]) => {
    if (!pdfDoc) return;
    const pageNumber = await resolvePageFromDest(pdfDoc, dest);
    if (pageNumber !== -1) {
      setCurrentPage(pageNumber);
      // On mobile, close outline after selection
      if (window.innerWidth < 768) {
        setIsOutlineOpen(false);
      }
    }
  };

  // Text to Speech Logic
  const stopReading = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (readingTimeoutRef.current) {
      clearTimeout(readingTimeoutRef.current);
    }
    setIsReading(false);
    setReadingSentence(null);
    readingQueueRef.current = [];
    readingIndexRef.current = 0;
  };

  const playNextSentence = () => {
    if (readingIndexRef.current >= readingQueueRef.current.length) {
      stopReading();
      return;
    }

    const sentence = readingQueueRef.current[readingIndexRef.current];
    setReadingSentence(sentence);

    // Cancel any previous utterance to be safe
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    
    // Use selected voice and rate
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang; 
    }
    utterance.rate = speechRate;

    utterance.onend = () => {
      readingIndexRef.current++;
      // Add a slight pause between clauses for a more natural feel
      readingTimeoutRef.current = setTimeout(() => {
        playNextSentence();
      }, 300); // 300ms pause
    };
    
    utterance.onerror = (e) => {
      // Ignore interruption errors
      if (e.error === 'interrupted' || e.error === 'canceled') {
        return;
      }
      console.error("Speech error details:", e.error);
      
      readingIndexRef.current++;
      readingTimeoutRef.current = setTimeout(() => {
        playNextSentence();
      }, 50);
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleRead = () => {
    if (isReading) {
      stopReading();
      return;
    }

    const selection = window.getSelection();
    let textToRead = "";

    if (selection && selection.toString().trim().length > 0) {
      textToRead = selection.toString();
    } else {
      textToRead = currentText;
    }

    if (!textToRead.trim()) return;

    // Normalize text: replace newlines with spaces to treat multiline text as single sentences
    const normalizedText = textToRead.replace(/[\r\n]+/g, ' ');

    let sentences: string[] = [];
    
    // Split by punctuation: comma, period, semicolon, question mark, exclamation point, etc.
    const punctuationRegex = /[^,;.?!:，。；？！：、]+[,;.?!:，。；？！：、]*/g;
    
    const matches = normalizedText.match(punctuationRegex);
    
    if (matches) {
      sentences = Array.from(matches)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else {
      // Fallback if no specific punctuation found
      sentences = [normalizedText];
    }

    if (sentences.length === 0) return;

    readingQueueRef.current = sentences;
    readingIndexRef.current = 0;
    setIsReading(true);
    
    // Small timeout to allow state to settle
    setTimeout(() => {
      playNextSentence();
    }, 10);
  };

  return (
    <div 
      className="flex flex-col h-screen w-full bg-slate-50"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          {pdfDoc && (
             <button 
                onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="Toggle Outline"
             >
               {isOutlineOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
             </button>
          )}
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-lg leading-tight hidden sm:block">Gemini Reader</h1>
            {fileName && <p className="text-xs text-slate-500 max-w-[200px] truncate">{fileName}</p>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
           
           {/* Language Selector */}
           <div className="hidden md:flex items-center gap-2 mr-4 bg-slate-100 rounded-lg px-2 py-1">
             <Globe className="w-4 h-4 text-slate-500" />
             <select 
                value={targetLanguage} 
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-transparent border-none text-sm text-slate-700 font-medium focus:ring-0 cursor-pointer outline-none w-32"
                title="Select Target Language for Translation (Tab to translate)"
             >
               {LANGUAGES.map(lang => (
                 <option key={lang} value={lang}>{lang}</option>
               ))}
             </select>
           </div>

           {pdfDoc && (
             <>
                <div className="hidden md:flex items-center bg-slate-100 rounded-lg p-1 mr-2">
                  <Button variant="ghost" size="sm" onClick={() => changeScale(-0.1)} className="h-10 w-10 p-0">
                    <ZoomOut className="w-5 h-5" />
                  </Button>
                  <div className="flex items-center justify-center w-14 relative group">
                    <input 
                      type="text"
                      className="w-full bg-transparent text-center text-sm font-mono focus:outline-none focus:ring-0 p-0 text-slate-600"
                      value={zoomInput}
                      onChange={(e) => setZoomInput(e.target.value)}
                      onFocus={() => setIsZoomFocused(true)}
                      onBlur={() => { setIsZoomFocused(false); handleZoomCommit(); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                    />
                    <span className="text-xs text-slate-400 absolute right-0 pointer-events-none pr-1">%</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => changeScale(0.1)} className="h-10 w-10 p-0">
                    <ZoomIn className="w-5 h-5" />
                  </Button>
                </div>

                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                  <Button variant="ghost" size="sm" onClick={() => changePage(-1)} disabled={currentPage <= 1} className="h-10 w-10 p-0">
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <div className="flex items-center gap-1 px-2">
                    <input 
                      type="text"
                      className="w-10 bg-transparent text-right text-sm font-medium focus:outline-none focus:ring-0 p-0 text-slate-700"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onFocus={() => setIsPageFocused(true)}
                      onBlur={() => { setIsPageFocused(false); handlePageCommit(); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                    />
                    <span className="text-sm font-medium text-slate-500 whitespace-nowrap">
                       / {totalPages}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => changePage(1)} disabled={currentPage >= totalPages} className="h-10 w-10 p-0">
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
             </>
           )}

          <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>

          <label className="cursor-pointer">
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            <div className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload PDF</span>
            </div>
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm z-50 border-4 border-blue-500 border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center animate-bounce">
              <Upload className="w-12 h-12 text-blue-500 mb-4" />
              <p className="text-lg font-bold text-slate-700">Drop PDF here to read</p>
            </div>
          </div>
        )}

        {/* Translation Popup */}
        {translation.isOpen && (
          <div 
            ref={translationRef}
            className="fixed z-[60] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 w-[800px] max-w-[95vw] left-1/2 -translate-x-1/2"
            style={{ top: translation.y }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                <Globe className="w-4 h-4" />
                <span>Translate to {targetLanguage}</span>
              </div>
              <button 
                onClick={() => setTranslation(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 max-h-60 overflow-y-auto">
              <div>
                {translation.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating...
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 leading-relaxed font-medium">
                    {translation.translatedText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!pdfDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
            <div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-100 max-w-lg w-full">
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Gemini Reader</h2>
              <p className="text-slate-500 mb-8">Upload a PDF document to start reading and chatting with AI about its content.</p>
              
              <label className="cursor-pointer block w-full">
                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                <div className="w-full bg-slate-900 text-white hover:bg-slate-800 py-4 rounded-xl font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" />
                  Select PDF File
                </div>
              </label>
            </div>
          </div>
        ) : (
          <>
            {/* Outline Panel */}
            <OutlinePanel 
              outline={outline}
              isOpen={isOutlineOpen}
              onClose={() => setIsOutlineOpen(false)}
              onNavigate={handleOutlineNavigate}
            />

            <div className={`flex-1 flex flex-col transition-all duration-300 relative w-full`}>
              <PDFViewer 
                pdfDocument={pdfDoc} 
                currentPage={currentPage} 
                scale={scale}
                onTextExtracted={setCurrentText}
                onPageChange={setTotalPages}
                onNavigatePage={handlePageChangeFromScroll}
                highlightedText={readingSentence}
              />
              
              {/* Floating Action Buttons */}
              <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-3 items-end">
                 
                 {/* TTS Settings Popover */}
                 {isSettingsOpen && (
                   <div 
                     ref={settingsRef}
                     className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72 mb-2 animate-in fade-in slide-in-from-bottom-2"
                   >
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Reading Settings
                      </h4>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 font-medium block mb-1">Voice</label>
                          <select 
                            className="w-full text-sm border-slate-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            value={selectedVoice?.name || ""}
                            onChange={(e) => {
                              const v = voices.find(voice => voice.name === e.target.value);
                              setSelectedVoice(v || null);
                            }}
                          >
                            {voices.map(v => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="text-xs text-slate-500 font-medium block mb-1">Speed: {speechRate}x</label>
                          <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.1"
                            value={speechRate}
                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                          <div className="flex justify-between text-xs text-slate-400 mt-1">
                            <span>0.5x</span>
                            <span>1.0x</span>
                            <span>2.0x</span>
                          </div>
                        </div>
                      </div>
                   </div>
                 )}

                 {/* Reading Controls Group */}
                 <div className="flex items-center gap-3">
                   {isReading && (
                     <Button 
                        variant="secondary" 
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className="rounded-full w-12 h-12 shadow-lg flex items-center justify-center bg-white hover:bg-slate-50"
                        title="Reading Settings"
                     >
                        <Settings className="w-6 h-6 text-slate-600" />
                     </Button>
                   )}

                   <Button 
                      variant="primary" 
                      onClick={handleRead}
                      className={`rounded-full w-14 h-14 shadow-xl flex items-center justify-center ${
                        isReading 
                        ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500' 
                        : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
                      }`}
                      title={isReading ? "Stop Reading" : "Read Page"}
                    >
                      {isReading ? (
                        <Square className="w-6 h-6 fill-current" />
                      ) : (
                        <Headphones className="w-7 h-7" />
                      )}
                    </Button>
                 </div>

                 {/* Chat Toggle */}
                 {!isChatOpen && (
                   <Button 
                    variant="primary" 
                    onClick={() => setIsChatOpen(true)}
                    className="rounded-full w-14 h-14 shadow-xl flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    <MessageSquare className="w-7 h-7" />
                  </Button>
                )}
              </div>
            </div>

            {/* Chat Sidepanel */}
            {isChatOpen && (
               <div className="absolute inset-y-0 right-0 w-full md:w-96 shadow-2xl z-40 md:relative md:shadow-none flex-shrink-0">
                  <ChatPanel 
                    isOpen={isChatOpen} 
                    onClose={() => setIsChatOpen(false)} 
                    pageText={currentText}
                    currentPage={currentPage}
                  />
               </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
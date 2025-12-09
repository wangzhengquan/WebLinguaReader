import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Loader2, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { Message, ChatState } from '../types';
import { generateResponse } from '../services/geminiService';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pageText: string;
  currentPage: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, pageText, currentPage }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm reading this document with you. Ask me anything about the current page." }
  ]);
  const [chatState, setChatState] = useState<ChatState>(ChatState.IDLE);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Window State
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: window.innerHeight - 700 });
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });
  const sizeStartRef = useRef({ w: 0, h: 0 });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Adjust initial position if off-screen on load
  useEffect(() => {
    if (isOpen) {
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        setPosition(p => ({
            x: Math.min(Math.max(0, p.x), maxX),
            y: Math.min(Math.max(0, p.y), maxY)
        }));
    }
  }, [isOpen]);

  // --- Drag Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // Don't drag if clicking buttons
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { x: position.x, y: position.y };
  };

  // --- Resize Logic ---
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    sizeStartRef.current = { w: size.width, h: size.height };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPosition({
          x: posStartRef.current.x + dx,
          y: posStartRef.current.y + dy
        });
      }
      if (isResizing) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setSize({
          width: Math.max(300, sizeStartRef.current.w + dx),
          height: Math.max(400, sizeStartRef.current.h + dy)
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);


  const handleSend = async () => {
    if (!input.trim() || chatState === ChatState.LOADING) return;

    const userMessage: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setChatState(ChatState.LOADING);

    try {
      const responseText = await generateResponse(messages, pageText, input);
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
      setChatState(ChatState.IDLE);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error connecting to Gemini.", isError: true }]);
      setChatState(ChatState.ERROR);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
        className="fixed z-50 flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ 
            left: position.x, 
            top: position.y, 
            width: size.width, 
            height: size.height,
            transition: isDragging || isResizing ? 'none' : 'box-shadow 0.2s'
        }}
    >
      {/* Header (Draggable) */}
      <div 
        className={`flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-blue-600">
          <div className="bg-blue-100 p-1 rounded-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="font-semibold text-slate-800 text-sm">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
             <div className="text-slate-300 mr-2">
                <GripHorizontal className="w-4 h-4" />
             </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
            </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : msg.isError 
                    ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none'
                    : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' && !msg.isError && (
                <div className="mb-1 text-[10px] font-bold opacity-60 uppercase tracking-wider">
                  Gemini
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}
        {chatState === ChatState.LOADING && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-200 relative">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="w-full resize-none rounded-lg border border-slate-200 pl-3 pr-10 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm min-h-[44px] max-h-[100px] scrollbar-thin"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatState === ChatState.LOADING}
            className="absolute right-1.5 bottom-1.5 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex justify-between items-center px-1">
             <span className="text-[10px] text-slate-400">Page {currentPage} context active</span>
        </div>

        {/* Resize Handle */}
        <div 
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-end justify-end p-[1px] opacity-50 hover:opacity-100"
            onMouseDown={handleResizeStart}
        >
             <svg viewBox="0 0 6 6" className="w-2 h-2 fill-slate-400">
                 <path d="M6 6L6 2L2 6Z" />
             </svg>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './Button';
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

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
    <div className="flex flex-col h-full border-l border-slate-200 bg-white shadow-xl w-full md:w-96 relative z-20">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur">
        <div className="flex items-center gap-2 text-blue-600">
          <Sparkles className="w-5 h-5" />
          <h2 className="font-semibold text-slate-800">AI Assistant</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : msg.isError 
                    ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none'
                    : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' && !msg.isError && (
                <div className="mb-1 text-xs font-semibold opacity-50 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Gemini
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
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking about page {currentPage}...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this page..."
            className="w-full resize-none rounded-xl border border-slate-200 pl-4 pr-12 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm min-h-[50px] max-h-[120px]"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatState === ChatState.LOADING}
            className="absolute right-2 bottom-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-xs text-center text-slate-400">
          Context updated: Page {currentPage}
        </div>
      </div>
    </div>
  );
};

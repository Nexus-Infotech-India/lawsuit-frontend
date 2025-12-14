import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Sparkles, Scale } from 'lucide-react';
import { modelChatApi } from '@/services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Simple markdown-like renderer for AI responses
const renderContent = (content: string, isUser: boolean) => {
  if (isUser) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  // Parse and render markdown-like content
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';

  lines.forEach((line, index) => {
    // Code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
        codeContent = [];
      } else {
        elements.push(
          <div key={`code-${index}`} className="my-3 rounded-lg overflow-hidden border border-gray-200">
            {codeLanguage && (
              <div className="px-4 py-2 bg-midnight text-white text-xs font-medium">
                {codeLanguage}
              </div>
            )}
            <pre className="p-4 bg-gray-900 text-gray-100 text-sm overflow-x-auto">
              <code>{codeContent.join('\n')}</code>
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeContent = [];
        codeLanguage = '';
      }
      return;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={index} className="text-lg font-semibold text-midnight mt-4 mb-2">
          {line.slice(4)}
        </h3>
      );
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={index} className="text-xl font-bold text-midnight mt-5 mb-2">
          {line.slice(3)}
        </h2>
      );
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={index} className="text-2xl font-bold text-midnight mt-6 mb-3">
          {line.slice(2)}
        </h1>
      );
      return;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={index} className="ml-4 mb-1 flex items-start gap-2">
          <span className="text-primary mt-1.5">•</span>
          <span>{renderInlineFormatting(line.slice(2))}</span>
        </li>
      );
      return;
    }

    // Numbered list
    const numberedMatch = line.match(/^(\d+)\.\s/);
    if (numberedMatch) {
      elements.push(
        <li key={index} className="ml-4 mb-1 flex items-start gap-2">
          <span className="text-primary font-medium min-w-[20px]">{numberedMatch[1]}.</span>
          <span>{renderInlineFormatting(line.slice(numberedMatch[0].length))}</span>
        </li>
      );
      return;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={index} className="h-2" />);
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={index} className="mb-2 leading-relaxed">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  return <div className="space-y-1">{elements}</div>;
};

// Render inline formatting (bold, italic, code)
const renderInlineFormatting = (text: string): React.ReactNode => {
  // Handle inline code
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 bg-gray-100 text-primary text-sm rounded font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Handle bold
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith('**') && bp.endsWith('**')) {
        return <strong key={`${i}-${j}`} className="font-semibold text-midnight">{bp.slice(2, -2)}</strong>;
      }
      return bp;
    });
  });
};

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await modelChatApi.chatCompletion(
        updatedMessages.map(m => ({
          role: m.role,
          content: m.content,
        }))
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response || 'I apologize, I was unable to generate a response.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);

      const errorText = error.response?.data?.error || error.message || 'Connection error';

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I encountered an error: ${errorText}. Please try again.`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const suggestedPrompts = [
    "Explain the key differences between civil and criminal law",
    "What are the essential elements of a valid contract?",
    "Draft a basic non-disclosure agreement clause",
    "What is the statute of limitations for personal injury cases?"
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          /* Welcome Screen */
          <div className="h-full flex flex-col items-center justify-center px-6 py-12">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <Scale className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-midnight mb-2">Legal AI Assistant</h1>
            <p className="text-gray-600 text-center max-w-md mb-8">
              Get instant help with legal research, document drafting, case analysis, and more.
            </p>
            
            {/* Suggested Prompts */}
            <div className="w-full max-w-2xl">
              <p className="text-sm font-medium text-gray-500 mb-3 text-center">Try asking about:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(prompt)}
                    className="text-left p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700 group-hover:text-midnight">{prompt}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Messages List */
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user' 
                    ? 'bg-primary text-white' 
                    : 'bg-midnight text-white'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>
                
                {/* Message Content */}
                <div className={`flex-1 min-w-0 max-w-[80%] ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`flex items-center gap-2 mb-1 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="font-semibold text-midnight">
                      {message.role === 'user' ? 'You' : 'Legal AI'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className={`text-gray-700 inline-block text-left ${
                    message.role === 'user' 
                      ? 'bg-primary text-white rounded-xl rounded-tr-sm px-4 py-3' 
                      : 'bg-white border border-gray-200 rounded-xl rounded-tl-sm p-4'
                  }`}>
                    {renderContent(message.content, message.role === 'user')}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading State */}
            {isLoading && (
              <div className="flex gap-4 flex-row">
                <div className="w-10 h-10 rounded-xl bg-midnight text-white flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1 max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-midnight">Legal AI</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl rounded-tl-sm p-4 inline-block">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-gray-500 text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-3 bg-gray-50 border-2 border-gray-200 rounded-xl p-2 focus-within:border-primary transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about case law, draft clauses, or legal strategy..."
              disabled={isLoading}
              rows={1}
              className="flex-1 px-3 py-2 bg-transparent resize-none focus:outline-none text-gray-700 placeholder-gray-400 max-h-[150px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-primary text-white rounded-lg hover:bg-midnight transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
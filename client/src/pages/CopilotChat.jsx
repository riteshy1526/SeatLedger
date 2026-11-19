import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, RotateCcw, Send, Sparkles, User } from 'lucide-react';
import api from '../services/api';

const initialMessages = [
  {
    role: 'assistant',
    content: 'Namaste! I’m SeatLedger Copilot. Ask me about managing your library, students, seats, fees, or reminders.',
  },
];

const suggestions = [
  'How can I reduce late fee payments?',
  'Suggest a monthly fee collection workflow',
  'How should I follow up on high-risk defaulters?',
];

export default function CopilotChat() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (value = input) => {
    const message = value.trim();
    if (!message || sending) return;

    const history = messages.slice(-10);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setInput('');
    setError('');
    setSending(true);

    try {
      const response = await api.post(
        '/copilot/chat',
        { message, history },
        { timeout: 95000 }
      );
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.data.reply },
      ]);
    } catch (err) {
      setError(
        err.response?.data?.message
        || 'Could not reach Copilot. Check your connection and try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSend();
  };

  const handleReset = () => {
    if (sending) return;
    setMessages(initialMessages);
    setError('');
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-125px)] min-h-[480px] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">SeatLedger Copilot</h2>
            <p className="text-xs text-slate-500">Powered by GitHub Copilot SDK</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={sending}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New chat
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 p-5">
        {messages.map((item, index) => {
          const isAssistant = item.role === 'assistant';
          return (
            <div
              key={`${index}-${item.role}`}
              className={`flex items-start gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isAssistant ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isAssistant ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                  isAssistant
                    ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
                    : 'rounded-tr-sm bg-indigo-600 text-white'
                }`}
              >
                {item.content}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Copilot is thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 bg-white p-4">
        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSend(suggestion)}
                disabled={sending}
                className="rounded-full border border-indigo-100 bg-indigo-50/60 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="copilot-message">Message Copilot</label>
          <textarea
            id="copilot-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            placeholder="Ask Copilot about your library..."
            rows={1}
            maxLength={2000}
            disabled={sending}
            className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-slate-400">
          Messages are processed by GitHub Copilot. Copilot cannot access your live library data.
        </p>
      </div>
    </div>
  );
}

/**
 * Conversation Thread Component
 * T110: Displays message thread with pagination and visual indicators for bot vs user messages
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Avatar from '@/components/ui/Avatar';

interface Message {
  id: string;
  content: string;
  timestamp: number;
  sender: 'user' | 'bot' | 'contact';
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalMessages: number;
  hasMore: boolean;
}

interface ConversationThreadProps {
  contactId: string;
  contactName: string;
  messages: Message[];
  isLoading?: boolean;
  onScrollTop?: () => void;
  onLoadMore?: () => void;
  pagination?: PaginationInfo;
  pageSize?: number;
}

export default function ConversationThread({
  contactId: _contactId,
  contactName,
  messages,
  isLoading = false,
  onScrollTop,
  onLoadMore,
  pagination,
  pageSize = 50,
}: ConversationThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevScrollHeight = useRef<number>(0);

  // Auto-scroll to bottom when new messages arrive (only for new messages, not loaded history)
  useEffect(() => {
    // Don't auto-scroll if we just loaded more messages (scroll height changed significantly)
    const container = containerRef.current;
    if (container && prevScrollHeight.current > 0) {
      const heightDiff = container.scrollHeight - prevScrollHeight.current;
      if (heightDiff > 500) {
        // We loaded more messages, maintain scroll position
        container.scrollTop = heightDiff;
        prevScrollHeight.current = 0;
        return;
      }
    }
    scrollToBottom();
  }, [messages]);

  // Track scroll position for infinite scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleScroll() {
      if (!container) return;

      // Show scroll button if not at bottom
      const isAtBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      setShowScrollButton(!isAtBottom);

      // Trigger load more when scrolled near top (within 100px)
      if (container.scrollTop < 100 && !isLoading && !isLoadingMore) {
        if (onScrollTop) {
          onScrollTop();
        }
        if (onLoadMore && pagination?.hasMore) {
          handleLoadMore();
        }
      }
    }

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onScrollTop, onLoadMore, pagination?.hasMore, isLoading, isLoadingMore]);

  // Handle load more with scroll position preservation
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !onLoadMore || !pagination?.hasMore) return;

    const container = containerRef.current;
    if (container) {
      prevScrollHeight.current = container.scrollHeight;
    }

    setIsLoadingMore(true);
    try {
      await onLoadMore();
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, onLoadMore, pagination?.hasMore]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  function getMessageStatusIcon(status: Message['status']) {
    switch (status) {
      case 'sending':
        return (
          <svg className="h-3 w-3 text-slate-400 animate-pulse" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.416" strokeDashoffset="10" />
          </svg>
        );
      case 'sent':
        return (
          <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" transform="translate(-2, 0)" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" transform="translate(2, 0)" />
          </svg>
        );
      case 'read':
        return (
          <svg className="h-3 w-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" transform="translate(-2, 0)" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" transform="translate(2, 0)" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="h-3 w-3 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  }

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const message of messages) {
    const messageDate = formatDate(message.timestamp);
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groupedMessages.push({ date: messageDate, messages: [message] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(message);
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Messages Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {/* Load More / Pagination Controls at top */}
        <div ref={loadMoreRef} className="mb-4">
          {/* Loading indicator */}
          {(isLoading || isLoadingMore) && (
            <div className="flex justify-center mb-2">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading older messages...
              </div>
            </div>
          )}

          {/* Load More Button */}
          {!isLoading && !isLoadingMore && pagination?.hasMore && onLoadMore && (
            <div className="flex justify-center">
              <button
                onClick={handleLoadMore}
                className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Load older messages
              </button>
            </div>
          )}

          {/* All messages loaded indicator */}
          {!isLoading && !isLoadingMore && pagination && !pagination.hasMore && messages.length > pageSize && (
            <div className="flex justify-center">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Beginning of conversation
              </span>
            </div>
          )}

          {/* Pagination info */}
          {pagination && pagination.totalMessages > 0 && (
            <div className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
              Showing {messages.length} of {pagination.totalMessages} messages
            </div>
          )}
        </div>

        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No messages yet
              </p>
            </div>
          </div>
        )}

        {/* Message groups */}
        {groupedMessages.map((group, groupIndex) => (
          <div key={groupIndex}>
            {/* Date separator */}
            <div className="mb-4 mt-2 flex items-center justify-center">
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {group.date}
              </div>
            </div>

            {/* Messages */}
            {group.messages.map((message, messageIndex) => {
              const isOutgoing = message.sender === 'user' || message.sender === 'bot';
              const isBot = message.sender === 'bot';

              // Message grouping logic - detect consecutive messages from same sender
              const prevMessage = group.messages[messageIndex - 1];
              const nextMessage = group.messages[messageIndex + 1];
              const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender;
              const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;

              return (
                <div
                  key={message.id}
                  className={`${isLastInGroup ? 'mb-3' : 'mb-1'} flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Contact avatar for incoming - only show on first message of group */}
                  {!isOutgoing && (
                    <div className="mr-2 flex-shrink-0 self-end" style={{ width: 32 }}>
                      {isFirstInGroup && <Avatar name={contactName} size="sm" />}
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`max-w-[75%] ${isOutgoing ? 'order-first' : ''}`}>
                    {/* Bot indicator - only show on first bot message in group */}
                    {isBot && isFirstInGroup && (
                      <div className="mb-1 flex items-center gap-1 text-xs text-primary-500/70 dark:text-primary-400/70">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2M7.5 13A1.5 1.5 0 006 14.5 1.5 1.5 0 007.5 16 1.5 1.5 0 009 14.5 1.5 1.5 0 007.5 13m9 0a1.5 1.5 0 00-1.5 1.5 1.5 1.5 0 001.5 1.5 1.5 1.5 0 001.5-1.5 1.5 1.5 0 00-1.5-1.5M9 18v1h6v-1H9z"/>
                        </svg>
                        <span>Bot</span>
                      </div>
                    )}
                    <div
                      className={`group relative rounded-2xl px-3 py-2 shadow-sm ${
                        isOutgoing
                          ? isBot
                            ? 'bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100'
                            : 'bg-primary-500 text-white'
                          : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      } ${
                        isOutgoing
                          ? isLastInGroup ? 'rounded-br-sm' : ''
                          : isLastInGroup ? 'rounded-bl-sm' : ''
                      }`}
                    >
                      {/* Message content */}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>

                      {/* Time and status - only show on last message of group */}
                      {isLastInGroup && (
                        <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${
                          isOutgoing
                            ? isBot
                              ? 'text-primary-500 dark:text-primary-400'
                              : 'text-white/70'
                            : 'text-slate-400'
                        }`}>
                          <span>{formatTime(message.timestamp)}</span>
                          {isOutgoing && message.status && getMessageStatusIcon(message.status)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* User avatar for outgoing (optional, usually not shown in chat apps) */}
                </div>
              );
            })}
          </div>
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg transition-all hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <svg
            className="h-5 w-5 text-slate-600 dark:text-slate-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

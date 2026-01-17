/**
 * Conversation View Page
 * User Story 2: Displays message thread for a specific contact
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ConversationThread from '@/components/ConversationThread';
import Avatar from '@/components/ui/Avatar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import PersonaSelector from '@/components/PersonaSelector';
import { socketClient } from '@/lib/socket';

interface Contact {
  id: string;
  name: string;
  phoneNumber?: string;
  relationshipType: string;
  botEnabled: boolean;
  assignedPersona?: string;
  assignedPersonaName?: string;
  lastInteraction?: number;
}

interface Message {
  id: string;
  content: string;
  timestamp: number;
  sender: 'user' | 'bot' | 'contact';
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export default function ConversationPage() {
  const params = useParams();
  const contactId = params?.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contactId) {
      loadContactAndMessages();
      subscribeToMessages();
    }

    return () => {
      // Cleanup subscriptions
    };
  }, [contactId]);

  async function loadContactAndMessages() {
    setIsLoading(true);
    setError(null);

    try {
      // Try to load contact from API
      const contactResponse = await fetch(`/api/contacts/${contactId}`);

      if (contactResponse.ok) {
        const { contact: contactData } = await contactResponse.json();
        setContact(contactData);
      } else {
        // Fall back to placeholder if API fails
        console.warn('[ConversationPage] Contact API failed, using placeholder');
        await loadPlaceholderContact();
      }

      // Load placeholder messages (messages API not implemented yet)
      loadPlaceholderMessages();
    } catch (err: any) {
      console.error('[ConversationPage] Error loading data:', err);
      // Fall back to placeholder on error
      await loadPlaceholderContact();
      loadPlaceholderMessages();
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlaceholderContact() {
    // Placeholder contact
    const placeholderContact: Contact = {
      id: contactId,
      name: decodeURIComponent(contactId.replace('@c.us', '')),
      phoneNumber: contactId.replace('@c.us', ''),
      relationshipType: 'friend',
      botEnabled: true,
    };

    setContact(placeholderContact);
  }

  function loadPlaceholderMessages() {
    // Placeholder messages
    const placeholderMessages: Message[] = [
      {
        id: '1',
        content: 'Hey! How are you doing?',
        timestamp: Date.now() - 3600000 * 2,
        sender: 'contact',
        status: 'read',
      },
      {
        id: '2',
        content: "I'm doing great, thanks for asking! Just finished a big project at work.",
        timestamp: Date.now() - 3600000 * 2 + 60000,
        sender: 'bot',
        status: 'read',
      },
      {
        id: '3',
        content: 'That sounds awesome! What kind of project?',
        timestamp: Date.now() - 3600000,
        sender: 'contact',
        status: 'read',
      },
      {
        id: '4',
        content: "It's a new feature for our product. Been working on it for months and finally shipped it yesterday!",
        timestamp: Date.now() - 3600000 + 120000,
        sender: 'bot',
        status: 'delivered',
      },
      {
        id: '5',
        content: 'Congrats! We should celebrate sometime',
        timestamp: Date.now() - 1800000,
        sender: 'contact',
        status: 'read',
      },
      {
        id: '6',
        content: "Definitely! Let's grab lunch this weekend?",
        timestamp: Date.now() - 1800000 + 30000,
        sender: 'user',
        status: 'read',
      },
    ];

    setMessages(placeholderMessages);
  }

  function subscribeToMessages() {
    // Subscribe to new messages via Socket.io
    const socket = socketClient.getSocket();

    socket.on('new_message', (data: { contactId: string; message: Message }) => {
      if (data.contactId === contactId) {
        setMessages((prev) => [...prev, data.message]);
      }
    });

    socket.on('message_status', (data: { messageId: string; status: Message['status'] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
      );
    });
  }

  async function handleLoadMore() {
    setIsLoadingMore(true);
    // TODO: Implement pagination
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoadingMore(false);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col">
        <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <SkeletonCard />
        </div>
        <div className="flex-1 p-4">
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/30">
            <svg
              className="h-8 w-8 text-error-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-slate-900 dark:text-white">
            {error || 'Contact not found'}
          </p>
          <Link
            href="/contacts"
            className="mt-4 inline-block text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Back to Contacts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button */}
            <Link
              href="/contacts"
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>

            {/* Contact info */}
            <Avatar
              name={contact.name}
              size="md"
              status={contact.botEnabled ? 'online' : 'offline'}
            />
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-white">{contact.name}</h1>
              <div className="flex items-center gap-2">
                {contact.botEnabled ? (
                  <span className="badge badge-success badge-sm badge-dot">Bot Active</span>
                ) : (
                  <span className="badge badge-secondary badge-sm">Bot Paused</span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {contact.relationshipType}
                </span>
              </div>
            </div>

            {/* Persona Selector */}
            <PersonaSelector
              contactId={contact.id}
              currentPersonaId={contact.assignedPersona}
              currentPersonaName={contact.assignedPersonaName}
              onPersonaChange={(personaId, personaName) => {
                setContact({
                  ...contact,
                  assignedPersona: personaId || undefined,
                  assignedPersonaName: personaName || undefined,
                });
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Toggle bot */}
            <button
              className={`btn btn-sm ${
                contact.botEnabled ? 'btn-ghost text-error-600' : 'btn-primary'
              }`}
              onClick={() => setContact({ ...contact, botEnabled: !contact.botEnabled })}
            >
              {contact.botEnabled ? 'Pause Bot' : 'Enable Bot'}
            </button>

            {/* More options */}
            <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <ConversationThread
          contactId={contact.id}
          contactName={contact.name}
          messages={messages}
          isLoading={isLoadingMore}
          onScrollTop={handleLoadMore}
        />
      </div>

      {/* Input area (read-only for now) */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <svg
                className="h-5 w-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Messages are handled by the bot. Open WhatsApp to send messages manually.
              </span>
            </div>
          </div>
          <a
            href={`https://wa.me/${contact.phoneNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Open WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

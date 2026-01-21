/**
 * Parse Chat API Endpoint
 * Parses WhatsApp chat export files and returns messages with participants
 */

import { NextRequest, NextResponse } from 'next/server';

interface ParsedMessage {
  timestamp: string;
  sender: string;
  content: string;
  isMedia: boolean;
}

interface ParsedChatResponse {
  messages: ParsedMessage[];
  participants: string[];
  messageCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      return NextResponse.json({ error: 'File must be a .txt file' }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    if (!content.trim()) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Parse the WhatsApp export
    const result = parseWhatsAppExport(content);

    // Filter out system messages and media-only messages
    const textMessages = filterTextMessages(result.messages);

    // Convert dates to ISO strings for JSON response
    const response: ParsedChatResponse = {
      messages: textMessages.map((m) => ({
        timestamp: m.timestamp.toISOString(),
        sender: m.sender,
        content: m.content,
        isMedia: m.isMedia,
      })),
      participants: result.participants.filter((p) => p !== 'SYSTEM'),
      messageCount: textMessages.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[parse-chat] Error parsing file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}

// ============================================================================
// WhatsApp Parser Functions (adapted from services/graph-worker/src/ingestion/chat-parser.ts)
// ============================================================================

interface InternalParsedMessage {
  timestamp: Date;
  sender: string;
  content: string;
  isMedia: boolean;
  mediaType:
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'contact'
    | 'location'
    | undefined;
}

interface InternalParsedChat {
  messages: InternalParsedMessage[];
  participants: string[];
}

/**
 * Parse WhatsApp chat export text
 * Supports multiple WhatsApp export formats (iOS, Android, different locales)
 */
function parseWhatsAppExport(content: string): InternalParsedChat {
  const lines = content.split('\n');
  const messages: InternalParsedMessage[] = [];
  const participantSet = new Set<string>();
  let currentMessage: InternalParsedMessage | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Try to parse as a new message
    const parsed = parseMessageLine(trimmedLine);

    if (parsed) {
      // Save previous message if exists
      if (currentMessage) {
        messages.push(currentMessage);
      }
      currentMessage = parsed;
      participantSet.add(parsed.sender);
    } else if (currentMessage) {
      // This is a continuation of the previous message
      currentMessage.content += '\n' + trimmedLine;
    }
  }

  // Don't forget the last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  return {
    messages,
    participants: Array.from(participantSet),
  };
}

/**
 * Parse a single message line
 * Handles multiple WhatsApp export formats
 */
function parseMessageLine(line: string): InternalParsedMessage | null {
  // Format 1: [DD/MM/YYYY, HH:MM:SS] Sender: Message (iOS)
  // Format 2: DD/MM/YYYY, HH:MM - Sender: Message (Android)
  // Format 3: [DD/MM/YY, HH:MM:SS AM/PM] Sender: Message (iOS with 12h)
  // Format 4: MM/DD/YY, HH:MM - Sender: Message (US Android)

  const patterns = [
    // iOS format: [DD/MM/YYYY, HH:MM:SS]
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*([^:]+):\s*(.+)$/i,
    // iOS format with dashes: [DD-MM-YYYY, HH:MM:SS AM/PM]
    /^\[(\d{1,2}-\d{1,2}-\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*([^:]+):\s*(.+)$/i,
    // Android format: DD/MM/YYYY, HH:MM -
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*([^:]+):\s*(.+)$/i,
    // Alternative Android: DD/MM/YY, HH:MM - (no seconds)
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.+)$/i,
    // Format with dashes for date: DD-MM-YYYY
    /^(\d{1,2}-\d{1,2}-\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-?\s*([^:]+):\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const [, dateStr, timeStr, sender, content] = match;
      if (!dateStr || !timeStr || !sender || !content) continue;

      const timestamp = parseDateTime(dateStr, timeStr);

      if (timestamp) {
        const { isMedia, mediaType } = detectMediaMessage(content);

        return {
          timestamp,
          sender: sender.trim(),
          content: content.trim(),
          isMedia,
          mediaType,
        };
      }
    }
  }

  // Check for system messages (no sender)
  const systemPatterns = [
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*(.+)$/i,
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*(.+)$/i,
  ];

  for (const pattern of systemPatterns) {
    const match = line.match(pattern);
    if (match) {
      const [, dateStr, timeStr, content] = match;
      if (!dateStr || !timeStr || !content) continue;

      const timestamp = parseDateTime(dateStr, timeStr);

      // Check if this is a system message (group changes, encryption notices, etc.)
      if (timestamp && isSystemMessage(content)) {
        return {
          timestamp,
          sender: 'SYSTEM',
          content: content.trim(),
          isMedia: false,
          mediaType: undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Parse date and time strings into Date object
 */
function parseDateTime(dateStr: string, timeStr: string): Date | null {
  try {
    // Normalize date separators
    const normalizedDate = dateStr.replace(/-/g, '/');
    const parts = normalizedDate.split('/');

    if (parts.length !== 3) return null;

    const part0 = parts[0];
    const part1 = parts[1];
    const part2 = parts[2];

    if (!part0 || !part1 || !part2) return null;

    let day: number, month: number, year: number;

    // Detect date format (DD/MM/YYYY vs MM/DD/YYYY)
    // Heuristic: if first number > 12, it's likely the day
    const first = parseInt(part0, 10);
    const second = parseInt(part1, 10);

    if (first > 12) {
      // DD/MM/YYYY format
      day = first;
      month = second - 1; // JS months are 0-indexed
    } else if (second > 12) {
      // MM/DD/YYYY format
      month = first - 1;
      day = second;
    } else {
      // Ambiguous - assume DD/MM/YYYY (more common internationally)
      day = first;
      month = second - 1;
    }

    year = parseInt(part2, 10);
    if (year < 100) {
      year += 2000; // Convert 2-digit year
    }

    // Parse time
    let hours = 0,
      minutes = 0,
      seconds = 0;
    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const timeParts = timeStr.replace(/\s*[AP]M/i, '').split(':');

    const hourPart = timeParts[0];
    const minutePart = timeParts[1];

    if (!hourPart || !minutePart) return null;

    hours = parseInt(hourPart, 10);
    minutes = parseInt(minutePart, 10);
    if (timeParts[2]) {
      seconds = parseInt(timeParts[2], 10);
    }

    // Convert 12-hour to 24-hour if needed
    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }

    return new Date(year, month, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

/**
 * Detect if message contains media
 */
function detectMediaMessage(content: string): {
  isMedia: boolean;
  mediaType?: InternalParsedMessage['mediaType'];
} {
  const mediaPatterns: Array<{ pattern: RegExp; type: InternalParsedMessage['mediaType'] }> = [
    { pattern: /<Media omitted>/i, type: undefined },
    { pattern: /\.(jpg|jpeg|png|gif|webp)\s*\(file attached\)/i, type: 'image' },
    { pattern: /image omitted/i, type: 'image' },
    { pattern: /photo/i, type: 'image' },
    { pattern: /\.(mp4|mov|avi|webm)\s*\(file attached\)/i, type: 'video' },
    { pattern: /video omitted/i, type: 'video' },
    { pattern: /\.(mp3|ogg|opus|m4a)\s*\(file attached\)/i, type: 'audio' },
    { pattern: /audio omitted/i, type: 'audio' },
    { pattern: /PTT-/i, type: 'audio' }, // Voice note
    { pattern: /\.(pdf|doc|docx|xls|xlsx)\s*\(file attached\)/i, type: 'document' },
    { pattern: /document omitted/i, type: 'document' },
    { pattern: /sticker omitted/i, type: 'sticker' },
    { pattern: /contact card omitted/i, type: 'contact' },
    { pattern: /location:/i, type: 'location' },
    { pattern: /live location shared/i, type: 'location' },
  ];

  for (const { pattern, type } of mediaPatterns) {
    if (pattern.test(content)) {
      return { isMedia: true, mediaType: type };
    }
  }

  return { isMedia: false };
}

/**
 * Check if message is a system message
 */
function isSystemMessage(content: string): boolean {
  const systemPatterns = [
    /Messages and calls are end-to-end encrypted/i,
    /created group/i,
    /added you/i,
    /left the group/i,
    /removed you/i,
    /changed the subject/i,
    /changed this group's icon/i,
    /changed the group description/i,
    /You're now an admin/i,
    /security code changed/i,
    /Missed voice call/i,
    /Missed video call/i,
  ];

  return systemPatterns.some((pattern) => pattern.test(content));
}

/**
 * Filter out system messages and media-only messages
 */
function filterTextMessages(messages: InternalParsedMessage[]): InternalParsedMessage[] {
  return messages.filter((m) => {
    // Skip system messages
    if (m.sender === 'SYSTEM') return false;
    // Skip media-only messages (keep media messages that have text content)
    if (m.isMedia && m.content.trim() === '<Media omitted>') return false;
    return true;
  });
}

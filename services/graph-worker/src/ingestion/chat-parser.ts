/**
 * Chat Parser - WhatsApp Export Parser
 * User Story 2: Parses WhatsApp chat exports in various formats
 */

/**
 * Parsed message from chat export
 */
export interface ParsedMessage {
  timestamp: Date;
  sender: string;
  content: string;
  isMedia: boolean;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'location' | undefined;
  rawLine: string | undefined;
}

/**
 * Parsed chat export result
 */
export interface ParsedChat {
  messages: ParsedMessage[];
  participants: string[];
  startDate: Date | undefined;
  endDate: Date | undefined;
  messageCount: number;
  mediaCount: number;
}

/**
 * Parse WhatsApp chat export text
 * Supports multiple WhatsApp export formats (iOS, Android, different locales)
 */
export function parseWhatsAppExport(content: string): ParsedChat {
  const lines = content.split('\n');
  const messages: ParsedMessage[] = [];
  const participantSet = new Set<string>();
  let currentMessage: ParsedMessage | null = null;

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

  // Calculate statistics
  const participants = Array.from(participantSet);
  const mediaCount = messages.filter((m) => m.isMedia).length;

  const result: ParsedChat = {
    messages,
    participants,
    startDate: messages[0]?.timestamp,
    endDate: messages[messages.length - 1]?.timestamp,
    messageCount: messages.length,
    mediaCount,
  };

  return result;
}

/**
 * Parse a single message line
 * Handles multiple WhatsApp export formats
 */
function parseMessageLine(line: string): ParsedMessage | null {
  // Format 1: [DD/MM/YYYY, HH:MM:SS] Sender: Message (iOS)
  // Format 2: DD/MM/YYYY, HH:MM - Sender: Message (Android)
  // Format 3: [DD/MM/YY, HH:MM:SS AM/PM] Sender: Message (iOS with 12h)
  // Format 4: MM/DD/YY, HH:MM - Sender: Message (US Android)

  const patterns = [
    // iOS format: [DD/MM/YYYY, HH:MM:SS]
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*([^:]+):\s*(.+)$/i,
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
          rawLine: line,
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
          rawLine: line,
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
function detectMediaMessage(content: string): { isMedia: boolean; mediaType?: ParsedMessage['mediaType'] } {
  const mediaPatterns: Array<{ pattern: RegExp; type: ParsedMessage['mediaType'] }> = [
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
 * Filter messages by date range
 */
export function filterMessagesByDateRange(
  messages: ParsedMessage[],
  startDate?: Date,
  endDate?: Date
): ParsedMessage[] {
  return messages.filter((m) => {
    if (startDate && m.timestamp < startDate) return false;
    if (endDate && m.timestamp > endDate) return false;
    return true;
  });
}

/**
 * Filter out system messages and media-only messages
 */
export function filterTextMessages(messages: ParsedMessage[]): ParsedMessage[] {
  return messages.filter((m) => {
    // Skip system messages
    if (m.sender === 'SYSTEM') return false;
    // Skip media-only messages
    if (m.isMedia && !m.content.trim()) return false;
    return true;
  });
}

/**
 * Group messages into conversation chunks for entity extraction
 * Groups messages within a time window (default: 1 hour)
 */
export function groupIntoConversationChunks(
  messages: ParsedMessage[],
  windowMinutes: number = 60
): ParsedMessage[][] {
  if (messages.length === 0) return [];

  const firstMessage = messages[0];
  if (!firstMessage) return [];

  const chunks: ParsedMessage[][] = [];
  let currentChunk: ParsedMessage[] = [firstMessage];

  for (let i = 1; i < messages.length; i++) {
    const prevMsg = messages[i - 1];
    const currMsg = messages[i];

    if (!prevMsg || !currMsg) continue;

    const timeDiff = currMsg.timestamp.getTime() - prevMsg.timestamp.getTime();
    const windowMs = windowMinutes * 60 * 1000;

    if (timeDiff > windowMs) {
      // Start new chunk
      chunks.push(currentChunk);
      currentChunk = [currMsg];
    } else {
      currentChunk.push(currMsg);
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

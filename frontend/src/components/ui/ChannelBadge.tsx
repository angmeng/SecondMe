/**
 * Channel Badge Component
 * Displays the source channel of a message or contact with appropriate styling
 */

import type { ChannelId } from '@secondme/shared-types';

interface Props {
  /** Channel identifier (defaults to 'whatsapp' if not provided) */
  channelId?: ChannelId | string;
  /** Badge size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
}

const CHANNEL_CONFIGS: Record<
  string,
  { bg: string; text: string; label: string; shortLabel: string }
> = {
  whatsapp: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    label: 'WhatsApp',
    shortLabel: 'WA',
  },
  telegram: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    label: 'Telegram',
    shortLabel: 'TG',
  },
  discord: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-700 dark:text-indigo-300',
    label: 'Discord',
    shortLabel: 'DC',
  },
  slack: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    label: 'Slack',
    shortLabel: 'SL',
  },
};

const DEFAULT_CONFIG = {
  bg: 'bg-slate-100 dark:bg-slate-700',
  text: 'text-slate-600 dark:text-slate-300',
  label: 'Unknown',
  shortLabel: '??',
};

const SIZE_CLASSES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export default function ChannelBadge({ channelId, size = 'sm', className = '' }: Props) {
  const id = channelId || 'whatsapp';
  const config = CHANNEL_CONFIGS[id] || { ...DEFAULT_CONFIG, label: id, shortLabel: id.slice(0, 2).toUpperCase() };
  const sizeClass = SIZE_CLASSES[size];
  const label = size === 'xs' ? config.shortLabel : config.label;

  return (
    <span
      className={`rounded font-medium ${config.bg} ${config.text} ${sizeClass} ${className}`}
      title={config.label}
    >
      {label}
    </span>
  );
}

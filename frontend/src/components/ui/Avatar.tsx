/**
 * Avatar Component
 * Contact initials avatar with customizable colors and sizes
 */

interface AvatarProps {
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string;
  className?: string;
  status?: 'online' | 'offline' | 'away';
}

// Generate consistent color based on name
function getColorFromName(name: string | null | undefined): string {
  const colors: readonly string[] = [
    'bg-primary-500',
    'bg-success-500',
    'bg-warning-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ] as const;

  const safeName = name || '';
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index] as string;
}

// Get initials from name
function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || '';
    const last = parts[parts.length - 1]?.[0] || '';
    return (first + last).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({
  name,
  size = 'md',
  src,
  className = '',
  status,
}: AvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  };

  const statusSizeClasses = {
    sm: 'h-2 w-2 right-0 bottom-0',
    md: 'h-2.5 w-2.5 right-0 bottom-0',
    lg: 'h-3 w-3 right-0.5 bottom-0.5',
    xl: 'h-3.5 w-3.5 right-1 bottom-1',
  };

  const statusColorClasses = {
    online: 'bg-success-500 shadow-glow-success',
    offline: 'bg-slate-400',
    away: 'bg-warning-500 shadow-glow-warning',
  };

  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  return (
    <div className={`relative inline-flex ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className={`rounded-full object-cover ${sizeClasses[size]}`}
        />
      ) : (
        <div
          className={`
            flex items-center justify-center rounded-full font-medium text-white
            ${sizeClasses[size]}
            ${bgColor}
          `}
        >
          {initials}
        </div>
      )}

      {/* Status indicator */}
      {status && (
        <span
          className={`
            absolute rounded-full border-2 border-white dark:border-slate-800
            ${statusSizeClasses[size]}
            ${statusColorClasses[status]}
          `}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
}

// Avatar group component
interface AvatarGroupProps {
  avatars: { name: string; src?: string }[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = 'md', className = '' }: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  const overlapClasses = {
    sm: '-ml-2',
    md: '-ml-3',
    lg: '-ml-4',
  };

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  return (
    <div className={`flex items-center ${className}`}>
      {visibleAvatars.map((avatar, index) => (
        <div
          key={index}
          className={`relative rounded-full border-2 border-white dark:border-slate-800 ${
            index > 0 ? overlapClasses[size] : ''
          }`}
          style={{ zIndex: visibleAvatars.length - index }}
        >
          <Avatar name={avatar.name} src={avatar.src} size={size} />
        </div>
      ))}

      {remaining > 0 && (
        <div
          className={`
            flex items-center justify-center rounded-full border-2 border-white
            bg-slate-200 font-medium text-slate-600
            dark:border-slate-800 dark:bg-slate-700 dark:text-slate-300
            ${overlapClasses[size]}
            ${sizeClasses[size]}
          `}
          style={{ zIndex: 0 }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

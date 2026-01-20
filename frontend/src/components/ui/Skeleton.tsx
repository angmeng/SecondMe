/**
 * Skeleton Component
 * Loading placeholders with shimmer animation
 */

'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export default function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  };

  const baseStyle: React.CSSProperties = {
    width: width || (variant === 'circular' ? height : '100%'),
    height: height || (variant === 'text' ? '1rem' : variant === 'circular' ? width : '100%'),
  };

  if (lines > 1 && variant === 'text') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${variantClasses[variant]}`}
            style={{
              ...baseStyle,
              width: i === lines - 1 ? '75%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton ${variantClasses[variant]} ${className}`}
      style={baseStyle}
    />
  );
}

// Preset skeleton components for common use cases
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card space-y-4 ${className}`}>
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <Skeleton variant="text" lines={3} />
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton variant="circular" width={size} height={size} />;
}

export function SkeletonButton({ width = 100 }: { width?: number | string }) {
  return <Skeleton variant="rounded" width={width} height={40} />;
}

/**
 * T123: Enhanced Loading States
 */

// Skeleton for metrics display
export function SkeletonMetrics({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width="40%" height={20} />
        <Skeleton variant="circular" width={32} height={32} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" width="60%" height={12} />
            <Skeleton variant="text" width="40%" height={24} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for activity log entries
export function SkeletonActivityLog({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width={120} height={20} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" width={32} height={32} />
          <Skeleton variant="rounded" width={32} height={32} />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
            <Skeleton variant="rounded" width={32} height={32} />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <Skeleton variant="text" width="40%" height={14} />
                <Skeleton variant="text" width={50} height={12} />
              </div>
              <Skeleton variant="text" width="70%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for bot status component
export function SkeletonBotStatus({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width={100} height={20} />
        <Skeleton variant="rounded" width={60} height={24} />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={10} height={10} />
              <Skeleton variant="text" width={80} height={14} />
            </div>
            <Skeleton variant="text" width={60} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for conversation messages
export function SkeletonConversation({ count = 6, className = '' }: { count?: number; className?: string }) {
  // Use deterministic widths/heights based on index for consistent rendering
  const getMessageDimensions = (index: number) => {
    const widths = [180, 220, 160, 200, 140, 190];
    const heights = [50, 60, 45, 70, 55, 65];
    return {
      width: widths[index % widths.length],
      height: heights[index % heights.length],
    };
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => {
        const isOutgoing = i % 2 === 1;
        const dimensions = getMessageDimensions(i);
        return (
          <div key={i} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            {!isOutgoing && <Skeleton variant="circular" width={32} height={32} className="mr-2" />}
            <div className={`max-w-[75%] ${isOutgoing ? 'text-right' : ''}`}>
              <Skeleton
                variant="rounded"
                width={dimensions.width}
                height={dimensions.height}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Skeleton for contact list item
export function SkeletonContactItem({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={48} height={48} />
          <div className="space-y-2">
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width={80} height={12} />
            <Skeleton variant="rounded" width={60} height={20} />
          </div>
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>
    </div>
  );
}

// Full page loading skeleton
export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-900 p-6 ${className}`}>
      {/* Header skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={200} height={28} />
          <Skeleton variant="text" width={300} height={16} />
        </div>
        <div className="flex gap-3">
          <Skeleton variant="rounded" width={100} height={40} />
          <Skeleton variant="rounded" width={100} height={40} />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <SkeletonMetrics />
        <SkeletonBotStatus />
        <SkeletonActivityLog count={3} />
        <SkeletonCard />
      </div>
    </div>
  );
}

// Inline loading indicator
export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Loading overlay
export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="flex items-center gap-4">
          <LoadingSpinner size="lg" className="text-primary-600" />
          <span className="text-lg font-medium text-slate-900 dark:text-white">{message}</span>
        </div>
      </div>
    </div>
  );
}

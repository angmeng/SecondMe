/**
 * StatusIndicator Component
 * Animated status dots with glow effects
 */

interface StatusIndicatorProps {
  status: 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  label?: string;
  className?: string;
}

export default function StatusIndicator({
  status,
  size = 'md',
  pulse = false,
  label,
  className = '',
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };

  const statusClasses = {
    success: 'bg-success-500 shadow-glow-success',
    warning: 'bg-warning-500 shadow-glow-warning',
    error: 'bg-error-500 shadow-glow-error',
    neutral: 'bg-slate-400',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`
          inline-block rounded-full
          ${sizeClasses[size]}
          ${statusClasses[status]}
          ${pulse ? 'animate-pulse-subtle' : ''}
        `}
        aria-hidden="true"
      />
      {label && (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
    </div>
  );
}

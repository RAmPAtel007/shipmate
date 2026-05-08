import { cn } from '@/lib/utils/cn';
import type { ReactNode, HTMLAttributes } from 'react';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'navy';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-white shadow-card',
  elevated: 'bg-white shadow-elevated',
  bordered: 'bg-white border border-gray-200',
  navy:     'bg-[#1B2B5E] text-white',
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4 md:p-5',
  lg:   'p-5 md:p-6',
};

export function Card({ variant = 'default', padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Convenience sub-components
export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-semibold text-gray-900', className)} {...props}>
      {children}
    </h3>
  );
}

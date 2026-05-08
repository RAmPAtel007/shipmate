import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-[#F5C518] hover:bg-[#D4A016] active:bg-[#b8900f] text-[#1B2B5E] shadow-sm hover:shadow',
  secondary: 'bg-[#1B2B5E] hover:bg-[#2D4080] active:bg-[#111D3F] text-white shadow-sm',
  ghost:     'bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700',
  danger:    'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm',
  outline:   'bg-white border border-[#1B2B5E] hover:bg-[#1B2B5E]/5 text-[#1B2B5E]',
  success:   'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm',
};

const sizeClasses: Record<Size, string> = {
  xs:  'px-2.5 py-1    text-xs   rounded-lg  gap-1.5 font-medium',
  sm:  'px-3.5 py-1.5  text-sm   rounded-lg  gap-2   font-medium',
  md:  'px-4   py-2.5  text-sm   rounded-xl  gap-2   font-semibold',
  lg:  'px-5   py-3    text-base rounded-xl  gap-2.5 font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading…</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

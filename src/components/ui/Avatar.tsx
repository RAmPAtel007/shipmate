import { cn } from '@/lib/utils/cn';
import { getInitials, getAvatarColor } from '@/lib/utils/formatters';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

const sizeMap: Record<AvatarSize, { outer: string; text: string; indicator: string }> = {
  xs:  { outer: 'w-6 h-6',    text: 'text-[9px]',  indicator: 'w-1.5 h-1.5 border' },
  sm:  { outer: 'w-8 h-8',    text: 'text-xs',     indicator: 'w-2 h-2 border' },
  md:  { outer: 'w-10 h-10',  text: 'text-sm',     indicator: 'w-2.5 h-2.5 border-2' },
  lg:  { outer: 'w-14 h-14',  text: 'text-lg',     indicator: 'w-3 h-3 border-2' },
  xl:  { outer: 'w-20 h-20',  text: 'text-2xl',    indicator: 'w-4 h-4 border-2' },
};

export function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  const { outer, text, indicator } = sizeMap[size];
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <div
        className={cn(
          outer,
          'rounded-full flex items-center justify-center overflow-hidden select-none font-semibold text-white flex-shrink-0'
        )}
        style={!src ? { backgroundColor: bgColor } : undefined}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={text}>{initials}</span>
        )}
      </div>
      {online !== undefined && (
        <div
          className={cn(
            indicator,
            'absolute bottom-0 right-0 rounded-full border-white',
            online ? 'bg-emerald-500' : 'bg-gray-400'
          )}
        />
      )}
    </div>
  );
}

import Image from 'next/image';
import clsx from 'clsx';

export default function BrandWordmark({
  dark = false,
  compact = false,
}: {
  dark?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center">
      <Image
        src={dark ? '/brand/ssg-logo-color.png' : '/brand/ssg-logo-white.png'}
        alt="Scottish Stained Glass"
        width={compact ? 180 : 220}
        height={compact ? 14 : 16}
        className={clsx(
          'h-auto w-auto object-contain',
          dark ? 'opacity-95' : 'opacity-100',
          compact ? 'max-h-[20px] max-w-[180px]' : 'max-h-[28px] max-w-[220px]',
        )}
        priority
      />
    </div>
  );
}

import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full min-w-0 rounded-lg border border-input bg-background px-4 text-base transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground disabled:opacity-40',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

/* shadcn/ui Button, adapted to the engine's design tokens. */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // min-h-touch keeps every control at the 44px WCAG target size
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-cs font-ui text-[0.9375rem] ' +
    'min-h-touch transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg border border-accent hover:brightness-110',
        outline: 'border border-rule bg-transparent text-ink hover:border-accent',
        ghost: 'border border-transparent text-ink hover:bg-accent-wash',
        danger: 'border border-accent text-accent hover:bg-accent-wash',
      },
      size: { default: 'px-4 py-2', sm: 'px-3 py-1.5 text-sm', icon: 'min-w-touch px-0' },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
export { Button, buttonVariants };

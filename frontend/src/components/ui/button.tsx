import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-stone-900 text-white shadow-sm hover:bg-stone-800 active:bg-stone-950",
        secondary:
          "bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 active:bg-stone-100",
        ghost: "text-stone-600 hover:bg-stone-100 active:bg-stone-200",
        outline:
          "bg-transparent text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 active:bg-stone-100",
        accent:
          "bg-stone-900 text-white shadow-sm hover:bg-stone-800 active:bg-stone-950",
        danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
      },
      size: {
        default: "h-9 px-3.5 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

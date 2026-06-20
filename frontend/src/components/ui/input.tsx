import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm transition placeholder:text-stone-400 focus-visible:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/60 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[88px] w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm transition placeholder:text-stone-400 focus-visible:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/60 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

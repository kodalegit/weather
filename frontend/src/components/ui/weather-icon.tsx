import Image from "next/image";

import { cn } from "@/lib/utils";

type WeatherIconProps = {
  src?: string;
  alt: string;
  className?: string;
  size?: number;
};

export function WeatherIcon({
  src,
  alt,
  className,
  size = 40,
}: WeatherIconProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-stone-100 text-stone-400",
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("select-none", className)}
      unoptimized
    />
  );
}

import { cn } from "@/lib/utils";

/**
 * Monochrome logo tinted with `text-muted-foreground` (same gray as the OS
 * icons). The PNG only supplies the silhouette via a CSS mask.
 */
export function BrandMark({ src, className }: { src: string; className?: string }) {
  const mask = `url(${src})`;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-muted-foreground", className)}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

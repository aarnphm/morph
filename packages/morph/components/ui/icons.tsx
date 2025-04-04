import { cn } from "@/lib/utils"

type IconProps = React.ComponentPropsWithoutRef<"svg">

function Icon({ size, className, ...props }: IconProps & { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="currentColor"
      aria-hidden
      className={cn(
        "flex-shrink-0 overflow-visible",
        // 16px icons scale to 20px on touch devices
        size === 16 && "size-icon",
        className,
      )}
      {...props}
    />
  )
}
export function DotIcon(props: IconProps) {
  return (
    <Icon size={8} {...props}>
      <circle cx="6" cy="6" r="4" />
    </Icon>
  )
}

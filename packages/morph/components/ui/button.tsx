import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 focus-visible:ring-4 focus-visible:outline-1 aria-invalid:focus-visible:ring-0 hover:cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

const vaultButtonVariants = cva(
  "flex items-center justify-center gap-2 rounded-md text-white transition-colors text-xs font-medium shadow-sm hover:cursor-pointer",
  {
    variants: {
      color: {
        none: "",
        cyan: "bg-cyan-600 hover:bg-cyan-700",
        blue: "bg-blue-600 hover:bg-blue-700",
        green: "bg-green-600 hover:bg-green-700",
        orange: "bg-orange-600 hover:bg-orange-700",
        purple: "bg-purple-600 hover:bg-purple-700",
        yellow: "bg-yellow-500 hover:bg-yellow-700/80",
      },
      size: {
        default: "h-8 w-8",
        small: "h-6 w-6",
      },
    },
    defaultVariants: {
      color: "cyan",
      size: "default",
    },
  }
)

type VaultButtonProps = {
  children: React.ReactNode
  title?: string
  asChild?: boolean
} & React.ComponentProps<"button"> & 
  VariantProps<typeof vaultButtonVariants>

function VaultButton({
  className,
  children,
  color,
  size,
  title,
  asChild = false,
  ...props
}: VaultButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(vaultButtonVariants({ color, size, className }))}
      title={title}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Button, buttonVariants, VaultButton, vaultButtonVariants }

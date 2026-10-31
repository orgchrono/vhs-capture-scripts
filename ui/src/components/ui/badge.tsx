/* oxlint-disable react/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 leading-none select-none shrink-0 whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border border-slate-700/60 bg-slate-800 text-slate-100 shadow-xs",
        secondary:
          "border border-studio-border bg-studio-surface text-slate-400 shadow-xs",
        destructive:
          "border border-red-500/40 bg-red-950/80 text-red-300 shadow-xs",
        outline:
          "border border-studio-border bg-transparent text-slate-300",
        live:
          "border border-emerald-500/40 bg-emerald-950/80 text-emerald-300 shadow-xs",
        rec:
          "border border-red-500/50 bg-red-950/90 text-red-300 shadow-xs",
        warn:
          "border border-amber-500/40 bg-amber-950/80 text-amber-300 shadow-xs",
        info:
          "border border-sky-500/40 bg-sky-950/80 text-sky-300 shadow-xs",
      },
      size: {
        default: "text-[10px] px-2 py-0.5 min-h-[18px]",
        sm: "text-[9px] px-1.5 py-0.5 min-h-[16px]",
        xs: "text-[8px] px-1 py-0.5 min-h-[14px]",
        lg: "text-xs px-2.5 py-1 min-h-[22px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      <span className="inline-flex items-center justify-center gap-1 leading-none translate-y-[0.5px]">
        {children}
      </span>
    </div>
  )
}

export { Badge, badgeVariants }

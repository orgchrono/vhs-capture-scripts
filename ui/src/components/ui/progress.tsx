import * as React from "react"
import { cn } from "../../lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const clampedValue = Math.min(100, Math.max(0, value ?? 0))

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedValue}
        aria-valuetext={props["aria-valuetext"] ?? `${clampedValue}%`}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-sm bg-studio-bg border border-studio-border",
          className
        )}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-emerald-500 transition-all duration-300 ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          style={{ transform: `translateX(-${100 - clampedValue}%)` }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }

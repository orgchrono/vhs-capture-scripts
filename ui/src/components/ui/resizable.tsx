import * as React from "react"
import { GripVertical, GripHorizontal } from "lucide-react"
import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group
    orientation={orientation}
    className={cn(
      "flex h-full w-full",
      orientation === "vertical" ? "flex-col" : "flex-row",
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
  orientation?: "horizontal" | "vertical"
}) => (
  <Separator
    className={cn(
      "relative flex items-center justify-center bg-white/5 transition-colors hover:bg-sky-500/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500",
      orientation === "vertical"
        ? "h-1.5 w-full cursor-row-resize"
        : "w-1.5 h-full cursor-col-resize",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm bg-slate-800 border border-white/10 text-slate-400">
        {orientation === "vertical" ? (
          <GripHorizontal className="h-2.5 w-2.5" />
        ) : (
          <GripVertical className="h-2.5 w-2.5" />
        )}
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }

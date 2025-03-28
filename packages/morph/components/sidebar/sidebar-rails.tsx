"use client"

import * as React from "react"
import { 
  LayoutIcon, 
  PlusIcon, 
  ArchiveIcon, 
  ChatBubbleIcon, 
  HomeIcon,
  GearIcon
} from "@radix-ui/react-icons"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/components/ui/sidebar"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarRailsProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function SidebarRails({ className, ...props }: SidebarRailsProps) {
  const { toggleSidebar, state } = useSidebar()
  const isExpanded = state === "expanded"

  const sidebarItems = [
    { id: 'layout', icon: <LayoutIcon className="h-5 w-5" />, label: 'morph' },
    { id: 'new', icon: <PlusIcon className="h-5 w-5" />, label: 'New file', highlight: true },
    { id: 'home', icon: <HomeIcon className="h-5 w-5" />, label: 'Home' },
    { id: 'settings', icon: <GearIcon className="h-5 w-5" />, label: 'Settings' },
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        className={cn(
          "fixed z-20 top-0 left-0 h-full bg-background border-r flex flex-col items-center py-4 gap-4",
          isExpanded ? "w-52" : "w-14",
          className
        )}
        animate={{
          width: isExpanded ? "13rem" : "3.5rem",
          transition: {
            type: "spring",
            stiffness: 300,
            damping: 26,
            mass: 0.8,
            duration: 0.2
          }
        }}
        {...props}
      >
        {sidebarItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <motion.div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                  isExpanded ? "w-[90%] justify-start" : "w-10 justify-center",
                  item.highlight 
                    ? "text-white bg-orange-500 hover:bg-orange-600" 
                    : "text-gray-700 hover:bg-gray-100/60"
                )}
                onClick={item.id === 'layout' ? toggleSidebar : undefined}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                layout
              >
                {item.icon}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={isExpanded}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </motion.div>
    </TooltipProvider>
  )
} 
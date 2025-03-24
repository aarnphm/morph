import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarInset,
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

export default function Loading() {
  return (
    <main className="min-h-screen bg-background">
      <SidebarProvider defaultOpen={false}>
        <Sidebar className="bg-background">
          <SidebarHeader className="border-b h-10 p-0 min-h-10 sticky">
            <div className="h-full flex items-center justify-end mx-4 gap-2">
              <Skeleton className="h-6 w-6 p-0 rounded-full" />
              <Skeleton className="h-6 w-6 p-0 rounded-full" />
              <Skeleton className="h-6 w-6 p-0 rounded-full" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[1, 2, 3].map((i) => (
                    <SidebarMenuItem key={i}>
                      <SidebarMenuButton className="hover:bg-accent/50 transition-colors">
                        <Skeleton className="h-4 w-[16rem] p-2 mt-2" />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuButton>
                    <Skeleton className="h-4 w-[14rem] p-2 mt-2" />
                  </SidebarMenuButton>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SidebarMenuButton key={i}>
                      <Skeleton className="h-4 w-[10rem] p-2 mt-2" />
                    </SidebarMenuButton>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 h-10 border-b bg-background z-10">
            <div className="h-full flex shrink-0 items-center justify-between mx-4">
              <Skeleton className="h-6 w-6 p-0 rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 p-0 rounded-full" />
                <Skeleton className="h-6 w-6 p-0 rounded-full" />
              </div>
            </div>
          </header>
          <section className="flex flex-1 overflow-hidden m-4 rounded-md border">
            <div className="flex-1 border relative">
              <div className="h-full mx-12 pt-4 scrollbar-hidden">
                <div className="cm-editor">
                  <div className="cm-scroller">
                    <div className="cm-content pt-1 gap-4 flex flex-col">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <Skeleton
                          key={i}
                          className="h-4 rounded cm-line"
                          style={{
                            width: `${Math.random() * 20 + 60}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <footer className="sticky bottom-0 h-8 border-t text-xs/8 bg-background z-10">
            <div className="h-full flex shrink-0 items-center align-middle font-serif justify-end mx-4 gap-4 text-muted-foreground hover:text-accent-foreground cursor-pointer">
              <Skeleton className="h-6 w-6 p-0 rounded-full" />
            </div>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </main>
  )
}

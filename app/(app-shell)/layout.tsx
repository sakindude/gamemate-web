import AppSidebar from '@/components/AppSidebar'
import AppShellGuard from '@/components/auth/AppShellGuard'

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppShellGuard>
      <div className="min-h-screen bg-[#020617] text-white">
        <div className="fixed left-0 top-0 z-40 h-screen w-[248px]">
          <AppSidebar />
        </div>

        <main className="min-h-screen pl-[248px]">
          {children}
        </main>
      </div>
    </AppShellGuard>
  )
}

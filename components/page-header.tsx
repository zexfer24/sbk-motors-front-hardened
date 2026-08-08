import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  children?: ReactNode
}

export function PageHeader({ eyebrow, title, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
          {eyebrow}
        </p>
        <h1 className="heading-stamp mt-1 text-2xl text-foreground sm:text-3xl">
          {title}
        </h1>
      </div>
      {children}
    </header>
  )
}

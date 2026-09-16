"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Landmark, Menu, UserRound, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { AppBrandIcon } from "@/components/branding/app-brand-icon";
import { ProfileSecurityActions } from "@/components/auth/profile-security-actions";
import { cashNavigation, navigationGroups } from "@/lib/navigation";
import type { SessionIdentity } from "@/modules/auth/contracts";

type AppShellProps = {
  brandIconUrl: string;
  children: ReactNode;
  session: SessionIdentity;
};

function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Brand({ iconUrl, inverted = false }: { iconUrl: string; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <AppBrandIcon iconUrl={iconUrl} />
      <span className="leading-none">
        <span
          className={`block text-base font-bold tracking-[0.16em] ${
            inverted ? "text-white" : "text-zinc-950"
          }`}
        >
          IDM
        </span>
        <span className="mt-1 block text-[0.68rem] font-semibold tracking-[0.18em] text-orange-400 uppercase">
          OS
        </span>
      </span>
    </div>
  );
}

type SidebarContentProps = {
  onNavigate?: () => void;
  session: SessionIdentity;
};

function SidebarContent({
  iconUrl,
  onNavigate,
  session,
}: SidebarContentProps & { iconUrl: string }) {
  const pathname = usePathname();
  const isCashRoute = pathname.startsWith("/caja");
  const [isCashOpen, setIsCashOpen] = useState(isCashRoute);

  useEffect(() => {
    if (isCashRoute) return;
    const timer = window.setTimeout(() => setIsCashOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [isCashRoute]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 px-4 py-5 text-zinc-300">
      <Link
        aria-label="IDM OS, ir a Inicio"
        className="rounded-xl px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        href="/"
        onClick={onNavigate}
      >
        <Brand iconUrl={iconUrl} inverted />
      </Link>

      <nav
        aria-label="Navegación principal"
        className="mt-10 min-h-0 flex-1 space-y-7 overflow-y-auto pr-1 pb-5 [scrollbar-color:#52525b_transparent] [scrollbar-width:thin]"
      >
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[0.68rem] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
              {group.label}
            </p>
            <ul className="mt-2 flex flex-col space-y-1">
              {group.label === "Operación" ? (
                <li className="order-1">
                  <button
                    aria-controls="caja-subnavigation"
                    aria-expanded={isCashOpen}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${isCashRoute ? "border-orange-500 bg-orange-500/15 text-white" : "border-transparent text-zinc-300 hover:bg-white/7 hover:text-white"}`}
                    onClick={() => setIsCashOpen((open) => !open)}
                    type="button"
                  >
                    <Landmark
                      className={`size-[1.1rem] ${isCashRoute ? "text-orange-400" : "text-zinc-500"}`}
                      strokeWidth={1.8}
                    />
                    <span className="flex-1">Caja</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 transition-transform duration-150 ${isCashOpen ? "rotate-180 text-orange-400" : "text-zinc-500"}`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-150 ${isCashOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    id="caja-subnavigation"
                  >
                    <ul className="mt-1 ml-6 min-h-0 space-y-1 overflow-hidden border-l border-white/10 pl-2">
                      {cashNavigation.map((item) => {
                        const current = pathname === item.href;
                        const Icon = item.icon;
                        return (
                          <li key={item.href}>
                            <Link
                              aria-current={current ? "page" : undefined}
                              className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${current ? "bg-white/10 font-semibold text-white" : "text-zinc-400 hover:bg-white/7 hover:text-white"}`}
                              href={item.href}
                              onClick={onNavigate}
                            >
                              <Icon
                                className={`size-3.5 ${current ? "text-orange-400" : "text-zinc-500"}`}
                              />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              ) : null}
              {group.items.map((item) => {
                const current = isCurrentPath(pathname, item.href);
                const Icon = item.icon;

                return (
                  <li
                    className={
                      group.label === "Operación"
                        ? item.href === "/"
                          ? "order-0"
                          : "order-2"
                        : undefined
                    }
                    key={item.href}
                  >
                    <Link
                      aria-current={current ? "page" : undefined}
                      className={`group flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                        current
                          ? "border-orange-500 bg-orange-500/15 text-white"
                          : "border-transparent text-zinc-300 hover:bg-white/7 hover:text-white"
                      }`}
                      href={item.href}
                      onClick={onNavigate}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-[1.1rem] shrink-0 ${
                          current
                            ? "text-orange-400"
                            : "text-zinc-500 group-hover:text-zinc-300"
                        }`}
                        strokeWidth={1.8}
                      />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-3 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-500/15 text-orange-300">
            <UserRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {session.displayName}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {session.roles.includes("ADMINISTRADOR")
                ? "Administrador"
                : session.roles[0]}
            </p>
          </div>
        </div>
        <ProfileSecurityActions />
      </div>
    </div>
  );
}

export function AppShell({ brandIconUrl, children, session }: AppShellProps) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNavigationOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    const selector = "a[href], button:not([disabled])";

    const getFocusableElements = () =>
      Array.from(drawer?.querySelectorAll<HTMLElement>(selector) ?? []);

    getFocusableElements()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsNavigationOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements.at(-1);

      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isNavigationOpen]);

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.append(favicon);
    }

    favicon.href = brandIconUrl;
  }, [brandIconUrl]);

  const closeNavigation = () => setIsNavigationOpen(false);

  return (
    <div className="min-h-screen min-h-dvh bg-white text-zinc-900">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 lg:block">
        <SidebarContent iconUrl={brandIconUrl} session={session} />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link aria-label="IDM OS, ir a Inicio" href="/">
          <Brand iconUrl={brandIconUrl} />
        </Link>
        <button
          ref={triggerRef}
          aria-controls="mobile-navigation"
          aria-expanded={isNavigationOpen}
          aria-label="Abrir navegación"
          className="grid size-11 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
          onClick={() => setIsNavigationOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      </header>

      {isNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Cerrar navegación"
            className="absolute inset-0 cursor-default bg-zinc-950/55"
            onClick={closeNavigation}
            type="button"
          />
          <div
            ref={drawerRef}
            aria-label="Navegación principal"
            aria-modal="true"
            className="relative h-full w-[min(18rem,86vw)] border-r border-white/10 shadow-2xl"
            id="mobile-navigation"
            role="dialog"
          >
            <button
              aria-label="Cerrar navegación"
              className="absolute top-5 right-4 z-10 grid size-10 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              onClick={closeNavigation}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            <SidebarContent
              iconUrl={brandIconUrl}
              onNavigate={closeNavigation}
              session={session}
            />
          </div>
        </div>
      ) : null}

      <main className="min-h-screen min-h-dvh lg:pl-64">
        <div
          className="mx-auto max-w-7xl px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12"
          id="contenido"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

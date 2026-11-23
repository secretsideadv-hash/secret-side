"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { CompassIcon, FlagIcon, MapIcon, StampIcon } from "./icons";

interface NavItem {
  href: "/" | "/explore" | "/my-adventures" | "/passport";
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Discover", Icon: CompassIcon },
  { href: "/explore", label: "Explore", Icon: MapIcon },
  { href: "/my-adventures", label: "My adventures", Icon: FlagIcon },
  { href: "/passport", label: "Passport", Icon: StampIcon },
];

function isActive(pathname: string | null, href: NavItem["href"]): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/" || pathname.startsWith("/adventures");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="grid grid-cols-4">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-nav min-h-touch flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-amber" : "text-muted hover:text-fg"
              }`}
            >
              <Icon className="size-6" />
              <span className="leading-none">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Reads the URL, so it must sit inside <Suspense> (cacheComponents + dynamic routes). */
export function BottomNav() {
  return <BottomNavLinks pathname={usePathname()} />;
}

export function BottomNavShell({ children }: { children: React.ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto max-w-[430px]">{children}</div>
    </nav>
  );
}

import Link from "next/link";
import type { Route } from "next";

const items: Array<{ href: Route; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/revenue", label: "Revenue" },
  { href: "/staff", label: "Staff" },
  { href: "/players", label: "Players" },
  { href: "/billing", label: "Billing" },
  { href: "/admin", label: "Platform Admin" }
];

export function Sidebar() {
  return (
    <aside className="w-full border-b border-border bg-card p-4 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="mb-6 text-lg font-semibold">ServerForge</div>
      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

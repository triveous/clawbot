"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Icon, type IconName } from "./icon";

type NavItem =
  | { kind: "section"; label: string }
  | {
      kind: "link";
      id: string;
      label: string;
      icon: IconName;
      href: (orgId: string) => string;
      match: (pathname: string, orgId: string) => boolean;
      kbd?: string;
      staff?: boolean;
    };

function isRouteActive(pathname: string, target: string) {
  if (pathname === target) return true;
  return pathname.startsWith(`${target}/`);
}

const NAV: NavItem[] = [
  { kind: "section", label: "Getting started" },
  {
    kind: "link",
    id: "quickstart",
    label: "Quickstart",
    icon: "zap",
    href: (org) => `/dashboard/${org}/quickstart`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/quickstart`),
  },
  {
    kind: "link",
    id: "docs",
    label: "Docs",
    icon: "bookOpen",
    href: (org) => `/dashboard/${org}/docs`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/docs`),
    kbd: "?",
  },
  { kind: "section", label: "Workspace" },
  {
    kind: "link",
    id: "assistants",
    label: "Assistants",
    icon: "bot",
    href: (org) => `/dashboard/${org}`,
    match: (p, org) =>
      p === `/dashboard/${org}` ||
      p.startsWith(`/dashboard/${org}/assistant`),
  },
  {
    kind: "link",
    id: "billing",
    label: "Billing",
    icon: "creditCard",
    href: (org) => `/dashboard/${org}/billing`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/billing`),
  },
  {
    kind: "link",
    id: "pricing",
    label: "Pricing",
    icon: "tag",
    href: (org) => `/dashboard/${org}/pricing`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/pricing`),
  },
  {
    kind: "link",
    id: "members",
    label: "Members",
    icon: "users",
    href: (org) => `/dashboard/${org}/members`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/members`),
  },
  {
    kind: "link",
    id: "settings",
    label: "Settings",
    icon: "settings",
    href: (org) => `/dashboard/${org}/settings`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/settings`),
  },
  { kind: "section", label: "Platform" },
  {
    kind: "link",
    id: "admin",
    label: "Admin console",
    icon: "shield",
    href: (org) => `/dashboard/${org}/admin`,
    match: (p, org) => isRouteActive(p, `/dashboard/${org}/admin`),
    staff: true,
  },
];

export function Sidebar({ orgId }: { orgId: string }) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Image
          className="mark"
          src="/brand/logo-mark.svg"
          alt="Clawbot"
          width={26}
          height={26}
          priority
        />
        <div className="name">Clawbot</div>
        <div className="tag">BETA</div>
      </div>

      <div className="orgswitch-wrap">
        <OrganizationSwitcher
          hidePersonal={false}
          afterSelectOrganizationUrl="/dashboard/:id"
          afterCreateOrganizationUrl="/dashboard/:id"
          appearance={{
            variables: {
              colorBackground: "var(--card)",
              colorText: "var(--foreground)",
              colorPrimary: "var(--primary)",
              borderRadius: "8px",
              fontFamily: "var(--font-geist-sans)",
            },
            elements: {
              rootBox: "orgswitch-clerk",
              organizationSwitcherTrigger: "orgswitch",
            },
          }}
        />
      </div>

      <nav className="nav">
        {NAV.map((item, idx) => {
          if (item.kind === "section") {
            return (
              <div key={`sec-${idx}`} className="nav__section">
                {item.label}
              </div>
            );
          }
          const active = item.match(pathname, orgId);
          return (
            <Link
              key={item.id}
              href={item.href(orgId)}
              className={`nav__link${active ? " is-active" : ""}`}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
              {item.kbd ? <span className="kbd">{item.kbd}</span> : null}
              {item.staff ? <span className="pill">Staff</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        <div className="userchip">
          <UserButton
            appearance={{
              variables: {
                colorBackground: "var(--card)",
                colorText: "var(--foreground)",
                colorPrimary: "var(--primary)",
                fontFamily: "var(--font-geist-sans)",
              },
              elements: {
                userButtonBox: "userchip__clerk",
                userButtonTrigger: "userchip__trigger",
              },
            }}
            showName
          />
        </div>
      </div>
    </aside>
  );
}

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  "aria-hidden": true,
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function UserIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>;
}

export function MenuIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
}

export function ChevronDownIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="m8 10 4 4 4-4"/></svg>;
}

export function ShieldIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>;
}

export function ClipboardCheckIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 12l2 2 5-5"/></svg>;
}

export function StoreIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5"/></svg>;
}

export function SearchIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

export function ArrowRightIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
}


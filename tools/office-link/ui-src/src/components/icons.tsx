import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="10.5" r="3" />
    <path d="M7.8 8.2L14 2M11 5l2 2M9.5 6.5l2 2" />
  </svg>
);

export const NetworkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2" y="9.5" width="12" height="4" rx="1" />
    <path d="M8 9.5V6M4.5 6h7M8 2.5V6" />
    <circle cx="5" cy="11.5" r="0.5" fill="currentColor" />
  </svg>
);

export const DeviceIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="1.5" width="8" height="13" rx="1.5" />
    <circle cx="8" cy="6" r="2" />
    <path d="M6.5 12.5h3" />
  </svg>
);

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 1 0-9 0c0 3.8 4.5 8 4.5 8Z" />
    <circle cx="8" cy="6.5" r="1.5" />
  </svg>
);

export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ strokeWidth: 1.6, ...p })}>
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </svg>
);

export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
  </svg>
);

export const WifiIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 6.5a9 9 0 0 1 12 0M4.2 9a6 6 0 0 1 7.6 0M6.4 11.5a3 3 0 0 1 3.2 0" />
    <circle cx="8" cy="13.5" r="0.6" fill="currentColor" />
  </svg>
);

export const CloudIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 13h6.5a3 3 0 0 0 .4-6 4 4 0 0 0-7.7 1A2.5 2.5 0 0 0 5 13Z" />
  </svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
  </svg>
);

export const ClipboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3" width="9" height="11.5" rx="1.5" />
    <path d="M6 3V2h4v1M6 7.5h4M6 10h4" />
  </svg>
);

export const SaveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
    <path d="M5 2.5v3.5h5V2.5M5 13.5V10h6v3.5" />
  </svg>
);

export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 2l12 12M6.3 6.4A2 2 0 0 0 9.6 9.7M4.2 4.6C2.5 5.8 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.4-.4 3.3-1M6.7 3.7C7.1 3.6 7.6 3.5 8 3.5c4 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.2" />
  </svg>
);

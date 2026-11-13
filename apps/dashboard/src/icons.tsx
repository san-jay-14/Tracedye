// Small line icons, drawn at 16px with the current text colour.
type IconProps = { className?: string };

const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const PlayIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4.5 3.2v9.6L12.5 8z" fill="currentColor" />
  </svg>
);
export const PauseIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M5 3.5v9M11 3.5v9" />
  </svg>
);
export const StepBackIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);
export const StepForwardIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);
export const SkipBackIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 3.5v9M12 3.5 7 8l5 4.5" />
  </svg>
);
export const SkipForwardIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3.5v9M4 3.5 9 8l-5 4.5" />
  </svg>
);

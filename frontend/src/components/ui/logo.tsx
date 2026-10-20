interface LogoProps {
  size: number;
  /** Empty when the app name is written next to the mark. */
  label?: string;
  className?: string;
}

/** The app mark (ui-guidelines §6.8): tile in the two user colors, teal badge, tilted dollar sign. */
export function Logo({ size, label = "", className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt={label}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}

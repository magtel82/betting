// Renders a flag from a team's ISO flag_code (e.g. "se", "gb-eng"), the same
// source of truth used across the app. Sizes with font-size via the `fi` class,
// so callers control size through `className` (e.g. "text-2xl").
//
// NOTE: pass the DB `flag_code`, NOT the FIFA short_name. There is no FIFA→ISO
// mapping here — that mapping was incomplete and caused missing flags.

interface Props {
  code:       string | null | undefined; // ISO flag_code, e.g. "se", "gb-eng"
  label?:     string;                     // accessible label, e.g. team short_name
  className?: string;                     // extra Tailwind classes for sizing
}

export function FlagIcon({ code, label, className = "" }: Props) {
  if (!code) {
    return (
      <span
        className={`inline-block align-middle text-gray-300 ${className}`}
        aria-label={label}
      >
        🏳
      </span>
    );
  }
  return (
    <span
      className={`fi fi-${code} align-middle ${className}`}
      aria-label={label}
      role="img"
    />
  );
}

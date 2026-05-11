// Maps FIFA short_name codes to flag-icons ISO codes.
// Subdivision flags (England, Scotland, Wales) use the gb-xxx format.
const FIFA_TO_ISO: Record<string, string> = {
  ALB: "al", ARG: "ar", AUS: "au", AUT: "at",
  BEL: "be", BRA: "br",
  CAN: "ca", CHI: "cl", CIV: "ci", COL: "co", CRC: "cr", CRO: "hr",
  DEN: "dk",
  ECU: "ec", EGY: "eg", ENG: "gb-eng", ESP: "es",
  FRA: "fr",
  GER: "de", GHA: "gh",
  HON: "hn",
  IRN: "ir", ITA: "it",
  JAM: "jm", JPN: "jp", JOR: "jo",
  KOR: "kr", KSA: "sa",
  MAR: "ma", MEX: "mx",
  NED: "nl", NGA: "ng", NOR: "no", NZL: "nz",
  PAN: "pa", PAR: "py", PER: "pe", POL: "pl", POR: "pt",
  QAT: "qa",
  RSA: "za",
  SCO: "gb-sct", SEN: "sn", SRB: "rs", SUI: "ch", SWE: "se",
  TUN: "tn", TUR: "tr",
  UKR: "ua", URU: "uy", USA: "us",
  VEN: "ve",
  WLS: "gb-wls",
};

interface Props {
  code: string;       // FIFA short_name, e.g. "ENG", "SCO"
  className?: string; // extra Tailwind classes for sizing
}

export function FlagIcon({ code, className = "" }: Props) {
  const iso = FIFA_TO_ISO[code?.toUpperCase()];
  if (!iso) {
    return (
      <span
        className={`inline-block align-middle text-gray-300 ${className}`}
        aria-label={code}
      >
        🏳
      </span>
    );
  }
  return (
    <span
      className={`fi fi-${iso} align-middle ${className}`}
      aria-label={code}
      role="img"
    />
  );
}

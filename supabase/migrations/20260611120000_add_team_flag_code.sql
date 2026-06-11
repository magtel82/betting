ALTER TABLE teams ADD COLUMN IF NOT EXISTS flag_code text;

UPDATE teams SET flag_code = CASE short_name
  WHEN 'MEX' THEN 'mx'   WHEN 'RSA' THEN 'za'   WHEN 'KOR' THEN 'kr'   WHEN 'CZE' THEN 'cz'
  WHEN 'BIH' THEN 'ba'   WHEN 'CAN' THEN 'ca'   WHEN 'QAT' THEN 'qa'   WHEN 'SUI' THEN 'ch'
  WHEN 'BRA' THEN 'br'   WHEN 'HAI' THEN 'ht'   WHEN 'MAR' THEN 'ma'   WHEN 'SCO' THEN 'gb-sct'
  WHEN 'AUS' THEN 'au'   WHEN 'PAR' THEN 'py'   WHEN 'TUR' THEN 'tr'   WHEN 'USA' THEN 'us'
  WHEN 'CUW' THEN 'cw'   WHEN 'ECU' THEN 'ec'   WHEN 'CIV' THEN 'ci'   WHEN 'GER' THEN 'de'
  WHEN 'JPN' THEN 'jp'   WHEN 'NED' THEN 'nl'   WHEN 'SWE' THEN 'se'   WHEN 'TUN' THEN 'tn'
  WHEN 'BEL' THEN 'be'   WHEN 'EGY' THEN 'eg'   WHEN 'IRN' THEN 'ir'   WHEN 'NZL' THEN 'nz'
  WHEN 'CPV' THEN 'cv'   WHEN 'KSA' THEN 'sa'   WHEN 'ESP' THEN 'es'   WHEN 'URU' THEN 'uy'
  WHEN 'FRA' THEN 'fr'   WHEN 'IRQ' THEN 'iq'   WHEN 'NOR' THEN 'no'   WHEN 'SEN' THEN 'sn'
  WHEN 'ALG' THEN 'dz'   WHEN 'ARG' THEN 'ar'   WHEN 'JOR' THEN 'jo'   WHEN 'AUT' THEN 'at'
  WHEN 'COL' THEN 'co'   WHEN 'COD' THEN 'cd'   WHEN 'POR' THEN 'pt'   WHEN 'UZB' THEN 'uz'
  WHEN 'ENG' THEN 'gb-eng' WHEN 'GHA' THEN 'gh' WHEN 'CRO' THEN 'hr'   WHEN 'PAN' THEN 'pa'
  ELSE NULL
END
WHERE flag_code IS NULL;

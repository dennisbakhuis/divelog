"""ISO 3166 alpha-3 codes as used in the log, with the alpha-2 code and English name."""

COUNTRIES: dict[str, tuple[str, str]] = {
    "NLD": ("NL", "Netherlands"),
    "BEL": ("BE", "Belgium"),
    "DEU": ("DE", "Germany"),
    "FRA": ("FR", "France"),
    "EGY": ("EG", "Egypt"),
    "MEX": ("MX", "Mexico"),
    "BES": ("BQ", "Bonaire"),
    "THA": ("TH", "Thailand"),
    "MLT": ("MT", "Malta"),
    "HRV": ("HR", "Croatia"),
    "ZAF": ("ZA", "South Africa"),
    "ESP": ("ES", "Spain"),
    "ITA": ("IT", "Italy"),
    "GRC": ("GR", "Greece"),
    "PRT": ("PT", "Portugal"),
    "NOR": ("NO", "Norway"),
    "GBR": ("GB", "United Kingdom"),
    "IDN": ("ID", "Indonesia"),
    "PHL": ("PH", "Philippines"),
    "MDV": ("MV", "Maldives"),
    "AUS": ("AU", "Australia"),
    "USA": ("US", "United States"),
    "CUW": ("CW", "Curaçao"),
    "ABW": ("AW", "Aruba"),
    "SXM": ("SX", "Sint Maarten"),
    "TUR": ("TR", "Türkiye"),
    "CYP": ("CY", "Cyprus"),
    "ISL": ("IS", "Iceland"),
    "AUT": ("AT", "Austria"),
    "CHE": ("CH", "Switzerland"),
}


def alpha2(code: str | None) -> str:
    """Two-letter code for a three-letter one; unknown codes fall back to 'XX'."""
    if not code:
        return "XX"
    entry = COUNTRIES.get(code.upper())
    return entry[0] if entry else (code.upper() if len(code) == 2 else "XX")


def country_name(code: str | None) -> str:
    if not code:
        return "Unknown"
    entry = COUNTRIES.get(code.upper())
    return entry[1] if entry else code

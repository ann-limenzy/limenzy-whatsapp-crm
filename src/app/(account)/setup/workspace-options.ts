import {
  COUNTRY_CODES,
  CURRENCY_CODES,
  TIME_ZONES,
} from "@/lib/validation/workspace-setup";

/**
 * Option data for the workspace setup form (spec 7, Screen 1).
 *
 * **These are presentation defaults, never authorisation.** Nothing here is
 * consulted by the server when it decides what to create: the Phase 4C-2
 * parser validates whatever is submitted against its own frozen lists, and the
 * Phase 4C-1 routine decides the rest. A wrong suggestion here is a usability
 * bug, not a security one.
 *
 * Everything is derived from the approved validation lists, so the picker can
 * never offer a value the server would reject.
 */

/**
 * Currency codes withheld from the picker.
 *
 * The server validator deliberately still accepts these for historical
 * compatibility - refusing a code a business may still be quoting would be
 * worse than storing it - but none of them should be *offered* to someone
 * setting up today. Croatia adopted the euro in 2023, Sierra Leone redenominated
 * to SLE, and CUC was withdrawn in 2021.
 */
export const RETIRED_CURRENCIES: readonly string[] = Object.freeze([
  "CUC",
  "HRK",
  "SLL",
]);

/** Everything the validator accepts, minus the retired codes. */
export const CURRENCY_OPTIONS: readonly string[] = Object.freeze(
  CURRENCY_CODES.filter((code) => !RETIRED_CURRENCIES.includes(code)),
);

/**
 * Country to its primary currency.
 *
 * A curated map, not a complete one: a country is listed only where a single
 * currency is the obvious answer. Anywhere it is not, the field is simply left
 * for the person to choose - which is the honest outcome, and better than a
 * confident wrong default. Every key is an approved country code and every
 * value an approved currency code; a test asserts both.
 */
export const COUNTRY_TO_CURRENCY: Readonly<Record<string, string>> =
  Object.freeze({
    // Euro area
    AD: "EUR",
    AT: "EUR",
    AX: "EUR",
    BE: "EUR",
    CY: "EUR",
    DE: "EUR",
    EE: "EUR",
    ES: "EUR",
    FI: "EUR",
    FR: "EUR",
    GF: "EUR",
    GP: "EUR",
    GR: "EUR",
    HR: "EUR",
    IE: "EUR",
    IT: "EUR",
    LT: "EUR",
    LU: "EUR",
    LV: "EUR",
    MC: "EUR",
    ME: "EUR",
    MF: "EUR",
    MQ: "EUR",
    MT: "EUR",
    NL: "EUR",
    PM: "EUR",
    PT: "EUR",
    RE: "EUR",
    SI: "EUR",
    SK: "EUR",
    SM: "EUR",
    VA: "EUR",
    YT: "EUR",

    // Rest of Europe
    AL: "ALL",
    AM: "AMD",
    AZ: "AZN",
    BA: "BAM",
    BG: "BGN",
    BY: "BYN",
    CH: "CHF",
    CZ: "CZK",
    DK: "DKK",
    GB: "GBP",
    GE: "GEL",
    HU: "HUF",
    IS: "ISK",
    MD: "MDL",
    MK: "MKD",
    NO: "NOK",
    PL: "PLN",
    RO: "RON",
    RS: "RSD",
    RU: "RUB",
    SE: "SEK",
    UA: "UAH",

    // Asia
    BD: "BDT",
    BT: "BTN",
    CN: "CNY",
    HK: "HKD",
    ID: "IDR",
    IN: "INR",
    JP: "JPY",
    KH: "KHR",
    KR: "KRW",
    KZ: "KZT",
    LA: "LAK",
    LK: "LKR",
    MM: "MMK",
    MN: "MNT",
    MO: "MOP",
    MV: "MVR",
    MY: "MYR",
    NP: "NPR",
    PH: "PHP",
    PK: "PKR",
    SG: "SGD",
    TH: "THB",
    TW: "TWD",
    UZ: "UZS",
    VN: "VND",

    // Middle East
    AE: "AED",
    BH: "BHD",
    IL: "ILS",
    IQ: "IQD",
    JO: "JOD",
    KW: "KWD",
    LB: "LBP",
    OM: "OMR",
    QA: "QAR",
    SA: "SAR",
    TR: "TRY",
    YE: "YER",

    // Africa
    AO: "AOA",
    BF: "XOF",
    BJ: "XOF",
    BW: "BWP",
    CD: "CDF",
    CF: "XAF",
    CG: "XAF",
    CI: "XOF",
    CM: "XAF",
    DZ: "DZD",
    EG: "EGP",
    ET: "ETB",
    GA: "XAF",
    GH: "GHS",
    GN: "GNF",
    GQ: "XAF",
    GW: "XOF",
    KE: "KES",
    MA: "MAD",
    ML: "XOF",
    MU: "MUR",
    MW: "MWK",
    MZ: "MZN",
    NA: "NAD",
    NE: "XOF",
    NG: "NGN",
    RW: "RWF",
    SC: "SCR",
    SN: "XOF",
    TD: "XAF",
    TG: "XOF",
    TN: "TND",
    TZ: "TZS",
    UG: "UGX",
    ZA: "ZAR",
    ZM: "ZMW",

    // Americas
    AR: "ARS",
    BO: "BOB",
    BR: "BRL",
    BS: "BSD",
    CA: "CAD",
    CL: "CLP",
    CO: "COP",
    CR: "CRC",
    DO: "DOP",
    EC: "USD",
    GT: "GTQ",
    HN: "HNL",
    JM: "JMD",
    MX: "MXN",
    NI: "NIO",
    PA: "PAB",
    PE: "PEN",
    PR: "USD",
    PY: "PYG",
    SV: "USD",
    TT: "TTD",
    US: "USD",
    UY: "UYU",
    VE: "VES",

    // Oceania
    AU: "AUD",
    FJ: "FJD",
    NZ: "NZD",
    PG: "PGK",
    WS: "WST",
  });

/**
 * The currency to suggest for a country, or `null` when there is no obvious
 * one. Callers must treat `null` as "leave it to the person".
 */
export function currencyForCountry(country: string): string | null {
  const currency = COUNTRY_TO_CURRENCY[country];
  return currency && CURRENCY_OPTIONS.includes(currency) ? currency : null;
}

export type TimeZoneGroup = {
  readonly region: string;
  readonly zones: readonly string[];
};

/**
 * Time zones grouped by their region prefix, so a phone's native picker shows
 * a few dozen entries per group rather than 554 in one list.
 *
 * `UTC` has no region and is listed first, because it is the sensible answer
 * for a business that does not want a local zone at all.
 */
export const TIME_ZONE_GROUPS: readonly TimeZoneGroup[] = Object.freeze(
  (() => {
    const byRegion = new Map<string, string[]>();
    for (const zone of TIME_ZONES) {
      const slash = zone.indexOf("/");
      const region = slash === -1 ? "UTC" : zone.slice(0, slash);
      const zones = byRegion.get(region) ?? [];
      zones.push(zone);
      byRegion.set(region, zones);
    }
    const regions = [...byRegion.keys()]
      .filter((region) => region !== "UTC")
      .sort();
    return [
      Object.freeze({
        region: "UTC",
        zones: Object.freeze(byRegion.get("UTC") ?? []),
      }),
      ...regions.map((region) =>
        Object.freeze({
          region,
          zones: Object.freeze((byRegion.get(region) ?? []).sort()),
        }),
      ),
    ];
  })(),
);

export type CountryOption = { readonly code: string; readonly name: string };

/**
 * Country codes paired with an English display name.
 *
 * Built on demand rather than at module load, and only ever called from the
 * server component - so `Intl.DisplayNames` runs on Node, where the full ICU
 * data is present, and the browser is handed finished labels. If the runtime
 * cannot name a region the code stands in for it, which is unhelpful but never
 * broken.
 *
 * The *label* is all this affects. The submitted value is the two-letter code,
 * and the server validates that against its own list.
 */
export function countryOptions(): readonly CountryOption[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    display = null;
  }

  const named = COUNTRY_CODES.map((code) => {
    let name = code;
    try {
      name = display?.of(code) ?? code;
    } catch {
      name = code;
    }
    return { code, name };
  });

  named.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return Object.freeze(named.map((option) => Object.freeze(option)));
}

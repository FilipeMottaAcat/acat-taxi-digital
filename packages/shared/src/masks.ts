/** Formats raw digits into the Brazilian phone mask "(DD) NNNNN-NNNN" / "(DD) NNNN-NNNN". */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Keeps only digits, capped at 3 characters. */
export function maskCarNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 3);
}

/** Keeps only letters (incl. accented) and whitespace. */
export function maskDriverName(value: string): string {
  return value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Admin login username — lowercase, no spaces (a full name typed here would silently become the username). */
export function maskUsername(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9._-]/g, "");
}

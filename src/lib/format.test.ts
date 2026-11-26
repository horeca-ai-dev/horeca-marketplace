import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber, formatTime } from "./format";

// The space before € is a non-breaking space (U+00A0): an amount must not wrap between number and sign.
const NBSP = " ";

describe("formatMoney", () => {
  it.each([
    [BigInt("123456"), `1.234,56${NBSP}€`],
    [BigInt("0"), `0,00${NBSP}€`],
    [BigInt("5"), `0,05${NBSP}€`],
    [BigInt("50"), `0,50${NBSP}€`],
    [BigInt("100"), `1,00${NBSP}€`],
    [BigInt("99999"), `999,99${NBSP}€`],
    [BigInt("100000"), `1.000,00${NBSP}€`],
    [BigInt("123456789"), `1.234.567,89${NBSP}€`],
    [BigInt("-123456"), `-1.234,56${NBSP}€`],
    [BigInt("-5"), `-0,05${NBSP}€`],
  ])("%s cents → %s", (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  it("keeps every digit beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatMoney(BigInt("1234567890123456789"))).toBe(
      `12.345.678.901.234.567,89${NBSP}€`,
    );
  });
});

describe("formatNumber", () => {
  it("uses the decimal comma and a dot for thousands", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(24)).toBe("24");
    expect(formatNumber(0.125, 3)).toBe("0,125");
  });
});

describe("formatDate", () => {
  it("is DD.MM.YYYY without a trailing dot", () => {
    expect(formatDate(new Date("2026-11-26T12:00:00Z"))).toBe("26.11.2026");
    expect(formatDate(new Date("2026-03-05T12:00:00Z"))).toBe("05.03.2026");
  });

  it("uses Montenegro's date, not UTC's", () => {
    // 23:30 UTC is already the next day in Podgorica (UTC+1 in winter, UTC+2 in summer).
    expect(formatDate(new Date("2026-12-31T23:30:00Z"))).toBe("01.01.2027");
    expect(formatDate(new Date("2026-06-30T22:30:00Z"))).toBe("01.07.2026");
  });
});

describe("formatTime", () => {
  it("is HH:MM on a 24-hour clock in Montenegro's time zone", () => {
    expect(formatTime(new Date("2026-11-26T13:05:00Z"))).toBe("14:05");
    expect(formatTime(new Date("2026-07-01T07:09:00Z"))).toBe("09:09");
  });

  it("shows midnight as 00, not 24", () => {
    expect(formatTime(new Date("2026-11-26T23:00:00Z"))).toBe("00:00");
  });
});

import { describe, expect, it } from "vitest";
import { maskCarNumber, maskDriverName, maskPhone } from "@acat/shared";

describe("maskPhone", () => {
  it("formats a full 11-digit mobile number", () => {
    expect(maskPhone("13900000000")).toBe("(13) 90000-0000");
  });

  it("formats progressively as digits are typed", () => {
    expect(maskPhone("13")).toBe("13");
    expect(maskPhone("1399")).toBe("(13) 99");
  });

  it("strips non-digit characters and caps at 11 digits", () => {
    expect(maskPhone("(13) 90000-0000extra1234")).toBe("(13) 90000-0000");
  });
});

describe("maskCarNumber", () => {
  it("keeps only digits, capped at 3", () => {
    expect(maskCarNumber("54a3x9")).toBe("543");
  });
});

describe("maskDriverName", () => {
  it("strips digits and symbols but keeps accented letters", () => {
    expect(maskDriverName("João123 D'Ávila!")).toBe("João DÁvila");
  });
});

import { describe, it, expect } from "vitest";
import { glicko2 } from "./glicko2";

describe("glicko2", () => {
  it("matches Glickman's paper example", () => {
    const r = glicko2(
      [
        { oppRating: 1400, oppRd: 30, score: 1 },
        { oppRating: 1550, oppRd: 100, score: 0 },
        { oppRating: 1700, oppRd: 300, score: 0 },
      ],
      { rating: 1500, rd: 200, volatility: 0.06 },
    );
    expect(Math.abs(r.rating - 1464)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.rd - 152)).toBeLessThanOrEqual(1);
  });
  it("more games shrink the ± range", () => {
    const few = glicko2(Array(4).fill({ oppRating: 2000, oppRd: 50, score: 0.5 }));
    const many = glicko2(Array(40).fill({ oppRating: 2000, oppRd: 50, score: 0.5 }));
    expect(many.rd).toBeLessThan(few.rd);
  });
});

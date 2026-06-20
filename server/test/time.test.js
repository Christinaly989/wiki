import test from "node:test";
import assert from "node:assert/strict";
import { formatInTimeZone, parseEasternDateTime } from "../src/utils/time.js";

test("parseEasternDateTime converts June release dates into Shanghai time", () => {
  const utc = parseEasternDateTime("June 10 2026", "08:30 AM");
  assert.equal(formatInTimeZone(utc, "Asia/Shanghai"), "2026/06/10 20:30");
});

test("parseEasternDateTime handles winter DST correctly", () => {
  const utc = parseEasternDateTime("January 13 2026", "08:30 AM");
  assert.equal(formatInTimeZone(utc, "Asia/Shanghai"), "2026/01/13 21:30");
});

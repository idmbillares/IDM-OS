import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  businessDateToInstant,
  businessDayBounds,
  businessMonthBounds,
  businessToday,
} from "../src/lib/business-time";
import {
  createIncomeSchema,
  createTransferSchema,
  createBalanceAdjustmentSchema,
} from "../src/modules/financial/validation";
import { validateIconPng } from "../src/modules/branding/png";
import { assertCashRead } from "../src/modules/financial/permissions";
import { parseHistoryQuery } from "../src/modules/financial/history-query";

test("Colombia: dates and filters include midnight and the entire day", () => {
  assert.equal(
    businessDateToInstant("2026-10-05").toISOString(),
    "2026-10-05T05:00:00.000Z",
  );
  const day = businessDayBounds("2026-10-05")!;
  assert.equal(day.end.toISOString(), "2026-10-06T04:59:59.999Z");
  assert.equal(businessToday(day.start), "2026-10-05");
  const month = businessMonthBounds(day.start);
  assert.equal(month.start.toISOString(), "2026-10-01T05:00:00.000Z");
  assert.equal(month.end.toISOString(), "2026-11-01T04:59:59.999Z");
  assert.equal(businessDayBounds("2026-02-30"), null);
});
test("money rejects fractional, unsafe and zero amounts and requires idempotency", () => {
  const input = {
    accountId: randomUUID(),
    idempotencyKey: randomUUID(),
    amountMinor: "5000",
    category: "Ventas",
    description: "Pago registrado",
    occurredAt: "2026-10-05",
  };
  assert.ok(createIncomeSchema.safeParse(input).success);
  for (const amountMinor of ["0", "-1", "1.25", "9007199254740992"])
    assert.equal(
      createIncomeSchema.safeParse({ ...input, amountMinor }).success,
      false,
    );
  for (const amountMinor of [null, "", "1e3", "0x100"])
    assert.equal(
      createIncomeSchema.safeParse({ ...input, amountMinor }).success,
      false,
    );
  for (const actualBalanceMinor of [null, ""])
    assert.equal(
      createBalanceAdjustmentSchema.safeParse({
        accountId: input.accountId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
        reason: "Conteo verificado",
        actualBalanceMinor,
      }).success,
      false,
    );
  assert.equal(
    createIncomeSchema.safeParse({ ...input, idempotencyKey: undefined }).success,
    false,
  );
});
test("transfers reject the same account and use Colombia dates", () => {
  const accountId = randomUUID();
  const input = {
    originAccountId: accountId,
    destinationAccountId: randomUUID(),
    idempotencyKey: randomUUID(),
    amountMinor: 1000,
    occurredAt: "2026-10-05",
    description: "Traslado",
  };
  assert.equal(
    createTransferSchema.parse(input).occurredAt.toISOString(),
    "2026-10-05T05:00:00.000Z",
  );
  assert.equal(
    createTransferSchema.safeParse({ ...input, destinationAccountId: accountId })
      .success,
    false,
  );
  assert.equal(
    createBalanceAdjustmentSchema.safeParse({
      accountId,
      idempotencyKey: randomUUID(),
      actualBalanceMinor: 0,
      occurredAt: "2026-10-05",
      reason: "",
    }).success,
    false,
  );
});
export const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("PNG upload validates raster, checksum, mime and size", () => {
  assert.deepEqual(validateIconPng(pngFixture, "image/png"), { width: 1, height: 1 });
  assert.throws(() => validateIconPng(pngFixture, "image/jpeg"));
  assert.throws(() => validateIconPng(pngFixture.subarray(0, 24), "image/png"));
  const corrupt = Buffer.from(pngFixture);
  corrupt[50] ^= 1;
  assert.throws(() => validateIconPng(corrupt, "image/png"));
  assert.throws(() => validateIconPng(Buffer.alloc(524289), "image/png"));
});

function pngHeader(width: number, height: number, interlace = 0) {
  const bytes = Buffer.from(pngFixture);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[28] = interlace;
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  return bytes;
}
test("PNG square/dimension errors are specific and valid Adam7 is accepted", () => {
  assert.throws(() => validateIconPng(pngHeader(2, 1), "image/png"), /cuadrado/);
  assert.throws(() => validateIconPng(pngHeader(513, 513), "image/png"), /512/);
  assert.deepEqual(validateIconPng(pngHeader(1, 1, 1), "image/png"), {
    width: 1,
    height: 1,
  });
  assert.throws(() => validateIconPng(pngFixture, "image/jpeg"), /Formato/);
  const oversized = Buffer.concat([pngFixture, Buffer.alloc(524288)]);
  assert.throws(() => validateIconPng(oversized, "image/png"), /512 KB/);
});
test("history query has no implicit dates, clears filters, and surfaces invalid values", () => {
  assert.equal(parseHistoryQuery({}).query, "");
  assert.equal(
    parseHistoryQuery({ from: "", to: "", q: "" }).filters.dateFrom,
    undefined,
  );
  const result = parseHistoryQuery({
    from: "2026-10-05",
    to: "2026-10-05",
    type: "INCOME",
  });
  assert.equal(result.filters.dateFrom?.toISOString(), "2026-10-05T05:00:00.000Z");
  assert.equal(result.filters.dateTo?.toISOString(), "2026-10-06T04:59:59.999Z");
  for (const params of [
    { from: "2026-02-30" },
    { from: "2026-10-06", to: "2026-10-05" },
    { account: "missing" },
    { type: "bad" },
    { from: ["2026-10-05", "2026-10-06"] },
  ])
    assert.ok(parseHistoryQuery(params).error);
});
test("only cash roles can read financial data", () => {
  for (const role of ["ADMINISTRADOR", "CAJA_SECRETARIA", "CONTADORA"] as const)
    assert.doesNotThrow(() => assertCashRead({ roles: [role] }));
  assert.throws(() => assertCashRead({ roles: ["PRODUCCION"] }));
  assert.throws(() => assertCashRead({ roles: [] }));
});

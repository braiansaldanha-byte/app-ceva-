import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activateInSnapshot,
  redeemInSnapshot,
  available,
  effectiveStatus,
  offerWindow,
  localDay,
} from "../lib/coupon-engine.ts";
const now = Date.parse("2026-11-10T19:00:00Z");
function initial() {
  return {
    pubs: [{ id: "pub", active: true }],
    offers: [
      {
        id: "offer",
        pub_id: "pub",
        active: true,
        subtitle: "Chopp em dobro",
        category: "Chopp em dobro",
        days: [0, 1, 2, 3, 4, 5, 6],
        start_time: "00:00",
        end_time: "23:59",
        daily_limit: 1,
      },
    ],
    redemptions: [],
  };
}
test("activation reserves capacity and returns a 15-minute opaque token", () => {
  const state = initial();
  const r = activateInSnapshot(state, "offer", "u1", now);
  assert.match(r.code, /^CEV-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(Date.parse(r.expires_at) - now, 900000);
  assert.equal(available(state.offers[0], state.redemptions, now), 0);
  assert.notEqual(r.token, r.code);
});
test("activation is idempotent for the same active offer", () => {
  const state = initial();
  const first = activateInSnapshot(state, "offer", "u1", now);
  assert.equal(
    activateInSnapshot(state, "offer", "u1", now + 1000).id,
    first.id,
  );
  assert.equal(state.redemptions.length, 1);
});
test("last available coupon cannot be reserved by another user", () => {
  const state = initial();
  activateInSnapshot(state, "offer", "u1", now);
  assert.throws(
    () => activateInSnapshot(state, "offer", "u2", now),
    /esgotaram/,
  );
});
test("only one active coupon per user and pub", () => {
  const state = initial();
  state.offers.push({ ...state.offers[0], id: "other" });
  activateInSnapshot(state, "offer", "u1", now);
  assert.throws(
    () => activateInSnapshot(state, "other", "u1", now),
    /já tem um cupom/,
  );
});
test("redemption consumes a coupon once only, including by QR", () => {
  const state = initial();
  const r = activateInSnapshot(state, "offer", "u1", now);
  assert.equal(
    redeemInSnapshot(state, "pub", "cevai:" + r.token, now + 1000).status,
    "redeemed",
  );
  assert.throws(
    () => redeemInSnapshot(state, "pub", r.code, now + 2000),
    /já utilizado/,
  );
});
test("codes and QR tokens are scoped to the correct pub", () => {
  const state = initial();
  const r = activateInSnapshot(state, "offer", "u1", now);
  assert.throws(
    () => redeemInSnapshot(state, "other", r.code, now),
    /não encontrado/,
  );
  assert.throws(
    () => redeemInSnapshot(state, "other", "cevai:" + r.token, now),
    /não encontrado/,
  );
});
test("expiration releases capacity and prevents redemption", () => {
  const state = initial();
  const r = activateInSnapshot(state, "offer", "u1", now);
  assert.equal(effectiveStatus(r, now + 900000), "expired");
  assert.equal(available(state.offers[0], state.redemptions, now + 900000), 1);
  assert.throws(
    () => redeemInSnapshot(state, "pub", r.code, now + 900000),
    /expirou/,
  );
});
test("expiry cannot exceed the end of the offer", () => {
  const state = initial();
  state.offers[0].end_time = "16:05";
  const r = activateInSnapshot(state, "offer", "u1", now);
  assert.equal(Date.parse(r.expires_at) - now, 300000);
});
test("first visit offer cannot be reused on another day", () => {
  const state = initial();
  state.offers[0].category = "Primeira visita";
  const r = activateInSnapshot(state, "offer", "u1", now);
  redeemInSnapshot(state, "pub", r.code, now + 1000);
  assert.throws(
    () => activateInSnapshot(state, "offer", "u1", now + 86400000),
    /já utilizou/,
  );
});
test("overnight windows honor the weekday where the offer began", () => {
  const state = initial();
  const o = {
    ...state.offers[0],
    days: [5],
    start_time: "18:00",
    end_time: "02:00",
  };
  assert.equal(offerWindow(o, Date.parse("2026-11-14T04:00:00Z")).open, true);
  assert.equal(offerWindow(o, Date.parse("2026-11-15T04:00:00Z")).open, false);
});
test("pausing stops new activations but honors an existing reservation", () => {
  const state = initial();
  const r = activateInSnapshot(state, "offer", "u1", now);
  state.offers[0].active = false;
  assert.throws(
    () => activateInSnapshot(state, "offer", "u2", now),
    /não está disponível/,
  );
  assert.equal(
    redeemInSnapshot(state, "pub", r.code, now + 1000).status,
    "redeemed",
  );
});
test("date boundaries follow Porto Alegre time", () => {
  assert.equal(localDay(Date.parse("2026-11-11T01:00:00Z")), "2026-11-10");
});

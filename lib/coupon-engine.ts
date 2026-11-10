import type { Offer, Redemption, Snapshot } from "./types";
export class CouponError extends Error {}
export function localDay(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function effectiveStatus(
  r: Redemption,
  now = Date.now(),
): Redemption["status"] {
  return r.status === "active" && Date.parse(r.expires_at) <= now
    ? "expired"
    : r.status;
}
export function available(
  offer: Offer,
  redemptions: Redemption[],
  now = Date.now(),
): number {
  const used = redemptions.filter(
    (r) =>
      r.offer_id === offer.id &&
      r.redemption_day === localDay(now) &&
      ["active", "redeemed"].includes(effectiveStatus(r, now)),
  ).length;
  return Math.max(0, offer.daily_limit - used);
}
export function offerWindow(
  offer: Offer,
  now = Date.now(),
): { open: boolean; endsAt: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    p.weekday,
  );
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const [sh, sm] = offer.start_time.split(":").map(Number),
    [eh, em] = offer.end_time.split(":").map(Number);
  const start = sh * 60 + sm,
    end = eh * 60 + em,
    overnight = end <= start;
  const dayOfOffer = overnight && minute < end ? (day + 6) % 7 : day;
  const open =
    offer.active &&
    offer.days.includes(dayOfOffer) &&
    (overnight
      ? minute >= start || minute < end
      : minute >= start && minute < end);
  const localEnd = Date.parse(
    `${p.year}-${p.month}-${p.day}T${offer.end_time.slice(0, 5)}:00-03:00`,
  );
  return {
    open,
    endsAt: localEnd + (overnight && minute >= start ? 86_400_000 : 0),
  };
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function activateInSnapshot(
  snapshot: Snapshot,
  offerId: string,
  userId: string,
  now = Date.now(),
): Redemption {
  const offer = snapshot.offers.find((o) => o.id === offerId);
  if (
    !offer ||
    !offer.active ||
    !snapshot.pubs.find((p) => p.id === offer.pub_id && p.active)
  )
    throw new CouponError("Esta oferta não está disponível.");
  const existing = snapshot.redemptions.find(
    (r) =>
      r.user_id === userId &&
      r.pub_id === offer.pub_id &&
      effectiveStatus(r, now) === "active",
  );
  if (existing) {
    if (existing.offer_id === offerId) return existing;
    throw new CouponError(
      "Tu já tem um cupom ativo neste pub. Usa ou cancela ele antes de ativar outro.",
    );
  }
  if (
    snapshot.redemptions.some(
      (r) =>
        r.user_id === userId &&
        r.offer_id === offerId &&
        r.status === "redeemed" &&
        (offer.category === "Primeira visita" ||
          r.redemption_day === localDay(now)),
    )
  )
    throw new CouponError("Tu já utilizou esta oferta no período permitido.");
  const window = offerWindow(offer, now);
  if (!window.open)
    throw new CouponError(
      "Esta oferta está fora dos dias ou horários de utilização.",
    );
  if (available(offer, snapshot.redemptions, now) < 1)
    throw new CouponError("Os cupons desta oferta esgotaram por hoje.");
  let code = "";
  for (let attempt = 0; attempt < 20; attempt++) {
    code =
      "CEV-" +
      Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((n) => alphabet[n % alphabet.length])
        .join("");
    if (
      !snapshot.redemptions.some(
        (r) => r.pub_id === offer.pub_id && r.code === code,
      )
    )
      break;
    code = "";
  }
  if (!code)
    throw new CouponError("Não foi possível gerar o código. Tenta novamente.");
  const redemption: Redemption = {
    id: crypto.randomUUID(),
    user_id: userId,
    offer_id: offer.id,
    pub_id: offer.pub_id,
    offer_title: offer.subtitle,
    code,
    token: crypto.randomUUID(),
    status: "active",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(Math.min(now + 900_000, window.endsAt)).toISOString(),
    redeemed_at: null,
    redemption_day: localDay(now),
  };
  snapshot.redemptions.push(redemption);
  return redemption;
}
export function redeemInSnapshot(
  snapshot: Snapshot,
  pubId: string,
  input: string,
  now = Date.now(),
): Redemption {
  const raw = input.trim(),
    token = raw.startsWith("cevai:") ? raw.slice(6) : null,
    code = raw.toUpperCase().replace(/\s/g, "");
  const normalized = code.startsWith("CEV-") ? code : "CEV-" + code;
  const redemption = snapshot.redemptions.find(
    (r) =>
      r.pub_id === pubId && (token ? r.token === token : r.code === normalized),
  );
  if (!redemption)
    throw new CouponError(
      "Código não encontrado neste pub. Confere os caracteres e o estabelecimento.",
    );
  if (redemption.status === "redeemed")
    throw new CouponError(
      `Cupom já utilizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(redemption.redeemed_at!))}.`,
    );
  if (effectiveStatus(redemption, now) === "expired")
    throw new CouponError(
      "Este cupom expirou. Peça para o cliente ativar uma nova oferta.",
    );
  if (redemption.status !== "active")
    throw new CouponError("Este cupom foi cancelado.");
  redemption.status = "redeemed";
  redemption.redeemed_at = new Date(now).toISOString();
  return redemption;
}

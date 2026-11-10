import { createClient } from "@supabase/supabase-js";
import { demoSnapshot } from "./demo-data";
import { activateInSnapshot, redeemInSnapshot } from "./coupon-engine";
import type {
  NewOffer,
  Pub,
  PublicConfig,
  Redemption,
  Snapshot,
  Staff,
  Viewer,
} from "./types";
const DEMO_KEY = "cevai-demo-v1",
  eventName = "cevai:data";
export const DEMO_VIEWER: Viewer = {
  id: "demo-client",
  email: "",
  name: "Conta de demonstração",
};
function readDemo(): Snapshot {
  try {
    const value = localStorage.getItem(DEMO_KEY);
    if (value) {
      const parsed = JSON.parse(value);
      if (
        Array.isArray(parsed.pubs) &&
        Array.isArray(parsed.offers) &&
        Array.isArray(parsed.redemptions)
      )
        return parsed;
    }
  } catch {
    /* Safe initial data. */
  }
  return structuredClone(demoSnapshot);
}
function saveDemo(value: Snapshot) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(eventName));
}
async function demoWrite<T>(fn: (snapshot: Snapshot) => T): Promise<T> {
  const mutate = () => {
    const state = readDemo();
    const result = fn(state);
    saveDemo(state);
    return result;
  };
  return navigator.locks
    ? navigator.locks.request("cevai-demo", mutate)
    : mutate();
}
export function createRepository(config: PublicConfig) {
  const demo = !config.url || !config.key,
    supabase = demo ? null : createClient(config.url, config.key);
  return {
    demo,
    async snapshot(): Promise<Snapshot> {
      if (!supabase) return readDemo();
      const readRedemptions = async () => {
        const rows: Redemption[] = [];
        let offset = 0;
        for (;;) {
          const response = await supabase.from("cevai_redemptions").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
          if (response.error) return { data: rows, error: response.error };
          rows.push(...(response.data ?? []));
          if ((response.data?.length ?? 0) < 1000) break;
          offset += 1000;
        }
        return { data: [...new Map(rows.map(r => [r.id,r])).values()], error: null };
      };
      const [pubs, offers, redemptions] = await Promise.all([
        supabase.from("cevai_pubs").select("*"),
        supabase.from("cevai_offers").select("*"),
        readRedemptions(),
      ]);
      for (const response of [pubs, offers, redemptions])
        if (response.error) throw response.error;
      return {
        pubs: pubs.data ?? [],
        offers: offers.data ?? [],
        redemptions: redemptions.data ?? [],
      };
    },
    async viewer(): Promise<Viewer | null> {
      if (!supabase) return DEMO_VIEWER;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user
        ? {
            id: user.id,
            email: user.email ?? "",
            name: user.user_metadata?.name ?? user.email ?? "Minha conta",
          }
        : null;
    },
    async staff(): Promise<Staff[]> {
      if (!supabase)
        return readDemo().pubs.map((p) => ({ pub_id: p.id, role: "owner" }));
      const { data, error } = await supabase
        .from("cevai_staff")
        .select("pub_id,role");
      if (error) throw error;
      return data ?? [];
    },
    async activate(offerId: string): Promise<Redemption> {
      if (!supabase)
        return demoWrite((state) =>
          activateInSnapshot(state, offerId, DEMO_VIEWER.id),
        );
      const { data, error } = await supabase.rpc("cevai_activate", {
        p_offer_id: offerId,
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.redemption;
    },
    async redeem(pubId: string, code: string): Promise<Redemption> {
      if (!supabase)
        return demoWrite((state) => redeemInSnapshot(state, pubId, code));
      const { data, error } = await supabase.rpc("cevai_redeem", {
        p_pub_id: pubId,
        p_code: code,
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.redemption;
    },
    async cancel(id: string): Promise<void> {
      if (!supabase) {
        await demoWrite((state) => {
          const r = state.redemptions.find(
            (x) =>
              x.id === id &&
              x.user_id === DEMO_VIEWER.id &&
              x.status === "active",
          );
          if (r) r.status = "cancelled";
        });
        return;
      }
      const { data, error } = await supabase.rpc("cevai_cancel", { p_id: id });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    async createOffer(offer: NewOffer): Promise<void> {
      if (!supabase) {
        await demoWrite((state) => {
          state.offers.push({ ...offer, id: crypto.randomUUID() });
        });
        return;
      }
      const { error } = await supabase.from("cevai_offers").insert(offer);
      if (error) throw error;
    },
    async toggleOffer(id: string, active: boolean): Promise<void> {
      if (!supabase) {
        await demoWrite((state) => {
          const offer = state.offers.find((o) => o.id === id);
          if (offer) offer.active = active;
        });
        return;
      }
      const { error } = await supabase
        .from("cevai_offers")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    async createPub(pub: Omit<Pub, "id" | "active">): Promise<void> {
      if (!supabase) {
        await demoWrite((state) => {
          state.pubs.push({ ...pub, id: crypto.randomUUID(), active: true });
        });
        return;
      }
      const { data, error } = await supabase.rpc("cevai_create_pub", {
        p_name: pub.name,
        p_neighborhood: pub.neighborhood,
        p_address: pub.address,
        p_description: pub.description,
        p_lat: pub.lat,
        p_lng: pub.lng,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    async signIn(email: string, password: string) {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    async signUp(email: string, password: string, name: string) {
      if (!supabase) return;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
      return !!data.session;
    },
    async signOut() {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    },
    subscribe(callback: () => void) {
      if (!supabase) {
        const onStorage = (event: StorageEvent) => {
          if (event.key === DEMO_KEY) callback();
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener(eventName, callback);
        return () => {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener(eventName, callback);
        };
      }
      const channel = supabase
        .channel("cevai-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cevai_redemptions" },
          callback,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cevai_offers" },
          callback,
        )
        .subscribe();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(() => {
        setTimeout(callback, 0);
      });
      return () => {
        void supabase.removeChannel(channel);
        subscription.unsubscribe();
      };
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;

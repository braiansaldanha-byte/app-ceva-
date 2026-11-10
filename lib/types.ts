export type Pub = {
  id: string;
  name: string;
  neighborhood: string;
  address: string;
  description: string;
  image: string;
  lat: number;
  lng: number;
  tags: string[];
  active: boolean;
};
export type Offer = {
  id: string;
  pub_id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  rule: string;
  days: number[];
  start_time: string;
  end_time: string;
  daily_limit: number;
  active: boolean;
};
export type Redemption = {
  id: string;
  user_id: string;
  pub_id: string;
  offer_id: string;
  offer_title: string;
  code: string;
  token: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redemption_day: string;
};
export type Snapshot = {
  pubs: Pub[];
  offers: Offer[];
  redemptions: Redemption[];
};
export type PublicConfig = { url: string; key: string };
export type Viewer = { id: string; email: string; name: string };
export type Staff = { pub_id: string; role: "owner" | "manager" | "cashier" };
export type NewOffer = Omit<Offer, "id">;

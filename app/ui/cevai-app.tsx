"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Beer,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Download,
  Heart,
  Info,
  List,
  LocateFixed,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import { createRepository } from "../../lib/repository";
import {
  available,
  effectiveStatus,
  offerWindow,
} from "../../lib/coupon-engine";
import type {
  Offer,
  Pub,
  PublicConfig,
  Redemption,
  Snapshot,
  Staff,
  Viewer,
} from "../../lib/types";
import {
  AccountDialog,
  Brand,
  CouponTicket,
  HowItWorks,
  Modal,
} from "./shared";
import PubMap from "./pub-map";
import MerchantPanel from "./merchant-panel";

const empty: Snapshot = { pubs: [], offers: [], redemptions: [] };
const categories = [
  "Todos",
  "Chopp em dobro",
  "Happy hour",
  "Petiscos",
  "Primeira visita",
];
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
function distanceTo(pub: Pub, position: [number, number]) {
  const rad = Math.PI / 180,
    dLat = (pub.lat - position[0]) * rad,
    dLng = (pub.lng - position[1]) * rad,
    a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(position[0] * rad) *
        Math.cos(pub.lat * rad) *
        Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CevaiApp({
  config,
  area,
}: {
  config: PublicConfig;
  area: "client" | "pub";
}) {
  const repo = useMemo(
    () => createRepository(config),
    [config.url, config.key],
  );
  const [data, setData] = useState<Snapshot>(empty),
    [viewer, setViewer] = useState<Viewer | null>(null),
    [staff, setStaff] = useState<Staff[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"explore" | "coupons">("explore"),
    [category, setCategory] = useState("Todos"),
    [query, setQuery] = useState(""),
    [neighborhood, setNeighborhood] = useState("Todos os bairros"),
    [hoodOpen, setHoodOpen] = useState(false),
    [onlyFavorites, setOnlyFavorites] = useState(false),
    [favorites, setFavorites] = useState<string[]>([]),
    [mapView, setMapView] = useState(false);
  const [pub, setPub] = useState<Pub | null>(null),
    [ticketId, setTicketId] = useState<string | null>(null),
    [how, setHow] = useState(false),
    [account, setAccount] = useState(false),
    [install, setInstall] = useState(false),
    [prompt, setPrompt] = useState<InstallPrompt | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [online, setOnline] = useState(true),
    [location, setLocation] = useState<[number, number] | null>(null),
    [locating, setLocating] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const loadVersion = useRef(0);
  const [, setTimeTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTimeTick(value => value + 1), 15000); return () => clearInterval(timer); }, []);
  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [next, user] = await Promise.all([repo.snapshot(), repo.viewer()]);
      const memberships = user ? await repo.staff() : [];
      if (version !== loadVersion.current) return;
      setData(next);
      setViewer(user);
      setStaff(memberships);
      setLoadError("");
    } catch (err) {
      if (version !== loadVersion.current) return;
      setLoadError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os pubs. Tenta novamente.",
      );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [repo]);
  useEffect(() => {
    if (window.location.hash === "#cupons") setView("coupons");
    void reload();
    return repo.subscribe(() => void reload());
  }, [repo, reload]);
  useEffect(() => {
    if (!ticketId || repo.demo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 2500);
    return () => clearInterval(timer);
  }, [ticketId, repo.demo, reload]);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("cevai-favorites") ?? "[]");
      if (Array.isArray(value))
        setFavorites(value.filter((x) => typeof x === "string"));
    } catch {
      /* Keep empty device preferences. */
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem("cevai-favorites", JSON.stringify(next));
    } catch {
      notify("Não foi possível guardar o favorito neste navegador.");
    }
  };
  const activate = async (offer: Offer) => {
    if (!online) {
      notify("Conecta à internet para ativar um cupom.");
      return;
    }
    if (!viewer) {
      setAccount(true);
      return;
    }
    setBusy(offer.id);
    try {
      const redemption = await repo.activate(offer.id);
      await reload();
      setPub(null);
      setTicketId(redemption.id);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Não foi possível ativar o cupom.",
      );
    } finally {
      setBusy(null);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) {
      notify(
        "A localização não está disponível. Escolhe um bairro para explorar.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocation([result.coords.latitude, result.coords.longitude]);
        setLocating(false);
        notify("Pronto! Pubs ordenados pela distância da tua localização.");
      },
      () => {
        setLocating(false);
        notify(
          "Não foi possível acessar tua localização. Tu pode explorar por bairro.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };
  const neighborhoods = useMemo(
    () => Array.from(new Set(data.pubs.map((p) => p.neighborhood))),
    [data.pubs],
  );
  const filteredPubs = useMemo(() => {
    let result = data.pubs.filter(
      (p) =>
        p.active &&
        (neighborhood === "Todos os bairros" ||
          p.neighborhood === neighborhood) &&
        (!onlyFavorites || favorites.includes(p.id)) &&
        `${p.name} ${p.neighborhood} ${p.tags.join(" ")}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(
            query
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, ""),
          ) &&
        data.offers.some(
          (o) =>
            o.pub_id === p.id &&
            o.active &&
            (category === "Todos" || o.category === category),
        ),
    );
    if (location)
      result = result.sort(
        (a, b) => distanceTo(a, location) - distanceTo(b, location),
      );
    return result;
  }, [data, neighborhood, onlyFavorites, favorites, query, category, location]);
  const myCoupons = data.redemptions
    .filter((r) => r.user_id === viewer?.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const activeCouponCount = myCoupons.filter(
    (r) => effectiveStatus(r) === "active",
  ).length;
  const redemption = data.redemptions.find((r) => r.id === ticketId);
  return (
    <div className="cevai-app">
      {repo.demo && (
        <div className="demo-banner">
          <span className="demo-dot" />
          Prévia do Cevaí <span className="demo-separator">·</span>
          <span>Pubs fictícios e testes salvos neste navegador.</span>
          <Info size={13} />
        </div>
      )}
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={16} /> Sem conexão. Ativações e validações ficam
          indisponíveis.
        </div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Menu principal">
            <button
              className={
                area === "client" && view === "explore"
                  ? "nav-link selected"
                  : "nav-link"
              }
              onClick={() => {
                if (area === "pub") window.location.assign("/");
                else setView("explore");
              }}
            >
              Explorar
            </button>
            <button
              className={view === "coupons" ? "nav-link selected" : "nav-link"}
              onClick={() => {
                if (area === "pub") window.location.assign("/#cupons");
                else setView("coupons");
              }}
            >
              Meus cupons
              {activeCouponCount > 0 && (
                <span className="nav-count">{activeCouponCount}</span>
              )}
            </button>
            <button className="nav-link" onClick={() => setHow(true)}>
              Como funciona
            </button>
          </nav>
          <div className="header-actions">
            <a
              className={`pub-link ${area === "pub" ? "current" : ""}`}
              href={area === "pub" ? "/" : "/pub"}
            >
              {area === "pub" ? <Compass size={17} /> : <Store size={17} />}
              <span>{area === "pub" ? "Ver app" : "Área do pub"}</span>
              <ArrowUpRight size={15} />
            </a>
            <button
              className="account-button"
              onClick={() => setAccount(true)}
              aria-label={
                viewer && !repo.demo
                  ? "Abrir minha conta"
                  : "Entrar ou ver conta"
              }
            >
              <UserRound size={18} />
              <span>
                {viewer && !repo.demo
                  ? viewer.name.split(" ")[0]
                  : "Minha conta"}
              </span>
            </button>
          </div>
        </div>
      </header>
      {area === "pub" ? (
        <MerchantPanel
          repository={repo}
          snapshot={data}
          viewer={viewer}
          staff={staff}
          reload={reload}
          notify={notify}
          onLogin={() => setAccount(true)}
          online={online}
        />
      ) : (
        <main>
          {view === "explore" ? (
            <>
              <section className="hero content-width">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span className="tiny-star">✳</span> PORTO ALEGRE, VAMOS DE
                    QUÊ?
                  </span>
                  <h1>
                    Teu próximo
                    <br />
                    <em>brinde tá aqui.</em>
                  </h1>
                  <p>
                    Encontra teu pub, garante um benefício
                    <br className="desktop-break" /> e chama a turma. O resto é
                    história.
                  </p>
                  <button
                    className="button button-amber hero-cta"
                    onClick={() =>
                      document
                        .getElementById("explorar")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    Bora pro rolê <ArrowUpRight size={19} />
                  </button>
                  <div className="hero-proof">
                    <span>
                      <Ticket size={15} /> Benefícios de verdade
                    </span>
                    <span>
                      <MapPin size={15} /> Feito pra POA
                    </span>
                  </div>
                </div>
                <div className="hero-image">
                  <img
                    src="/assets/pub-interior.webp"
                    alt="Ambiente ilustrativo de boteco, com luz aconchegante e balcão de madeira"
                    fetchPriority="high"
                  />
                  <div className="hero-image-shade" />
                  <div className="hero-photo-caption">
                    <span className="live-dot" /> A cidade acende. Os encontros
                    também.
                  </div>
                  <div className="hero-stamp">
                    <Beer size={25} />
                    <span>
                      O BOM É<br />
                      ESTAR JUNTO.
                    </span>
                  </div>
                </div>
                <span className="hero-doodle" aria-hidden="true">
                  ✳
                </span>
              </section>
              <section className="explore-section content-width" id="explorar">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow small-eyebrow">
                      UM BRINDE AOS BONS ENCONTROS
                    </span>
                    <h2>
                      Onde vai ser <em>hoje?</em>
                    </h2>
                  </div>
                  <div className="location-picker">
                    <button
                      className="location-button"
                      aria-expanded={hoodOpen}
                      onClick={() => setHoodOpen(!hoodOpen)}
                    >
                      <MapPin size={17} />
                      {neighborhood === "Todos os bairros"
                        ? "Porto Alegre"
                        : neighborhood}
                      <ChevronDown size={16} />
                    </button>
                    {hoodOpen && (
                      <div className="hood-menu">
                        <button
                          onClick={() => {
                            setNeighborhood("Todos os bairros");
                            setHoodOpen(false);
                          }}
                        >
                          Todos os bairros
                          {neighborhood === "Todos os bairros" && (
                            <Check size={16} />
                          )}
                        </button>
                        {neighborhoods.map((n) => (
                          <button
                            key={n}
                            onClick={() => {
                              setNeighborhood(n);
                              setHoodOpen(false);
                            }}
                          >
                            {n}
                            {neighborhood === n && <Check size={16} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="discovery-tools">
                  <label className="search-box">
                    <Search size={19} />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Busca teu pub, bairro ou estilo..."
                      aria-label="Buscar pubs"
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Limpar busca"
                        onClick={() => setQuery("")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </label>
                  <button
                    className={`tool-button ${location ? "is-active" : ""}`}
                    onClick={locate}
                    disabled={locating}
                  >
                    {locating ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <LocateFixed size={17} />
                    )}
                    <span>Perto de mim</span>
                  </button>
                  <button
                    className={`tool-button favorite-filter ${onlyFavorites ? "is-active" : ""}`}
                    onClick={() => setOnlyFavorites(!onlyFavorites)}
                    aria-pressed={onlyFavorites}
                  >
                    <Heart size={17} />
                    <span>Favoritos</span>
                  </button>
                  <div className="view-switch" aria-label="Visualização">
                    <button
                      className={!mapView ? "active" : ""}
                      onClick={() => setMapView(false)}
                      aria-pressed={!mapView}
                      aria-label="Ver em lista"
                    >
                      <List size={18} />
                    </button>
                    <button
                      className={mapView ? "active" : ""}
                      onClick={() => setMapView(true)}
                      aria-pressed={mapView}
                      aria-label="Ver no mapa"
                    >
                      <MapIcon size={18} />
                    </button>
                  </div>
                </div>
                <div className="category-row" aria-label="Tipos de benefício">
                  {categories.map((c, i) => (
                    <button
                      key={c}
                      className={`category-chip ${category === c ? "active" : ""}`}
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                    >
                      {i === 0 ? (
                        <Sparkles size={15} />
                      ) : i === 1 ? (
                        <Beer size={16} />
                      ) : i === 2 ? (
                        <Clock3 size={16} />
                      ) : i === 3 ? (
                        <span aria-hidden="true">✦</span>
                      ) : (
                        <Ticket size={15} />
                      )}{" "}
                      {c}
                    </button>
                  ))}
                </div>
                <div className="results-caption">
                  <span>
                    {loading
                      ? "Preparando teu rolê..."
                      : `${filteredPubs.length} ${filteredPubs.length === 1 ? "pub pra conhecer" : "pubs pra conhecer"}`}
                  </span>
                  <span>
                    {location
                      ? "Mais próximos primeiro"
                      : "Bons lugares. Melhores encontros."}
                  </span>
                </div>
                {loadError ? (
                  <div className="empty-state" role="alert">
                    <Info />
                    <h3>Não conseguimos carregar o rolê.</h3>
                    <p>{loadError}</p>
                    <button
                      className="button button-outline"
                      onClick={() => void reload()}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : loading ? (
                  <div className="pub-grid">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="pub-skeleton" />
                    ))}
                  </div>
                ) : filteredPubs.length === 0 ? (
                  <div className="empty-state">
                    <Search size={35} />
                    <h3>Nenhum pub por aqui ainda.</h3>
                    <p>
                      Tenta outro bairro ou ajusta os filtros para descobrir
                      mais opções.
                    </p>
                    <button
                      className="button button-outline"
                      onClick={() => {
                        setQuery("");
                        setCategory("Todos");
                        setNeighborhood("Todos os bairros");
                        setOnlyFavorites(false);
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : mapView ? (
                  <>
                    <PubMap
                      pubs={filteredPubs}
                      onSelect={setPub}
                      location={location}
                    />
                    {repo.demo && (
                      <p className="map-disclaimer">
                        Os pontos representam pubs fictícios para demonstração.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="pub-grid">
                    {filteredPubs.map((p, index) => {
                      const offers = data.offers.filter(
                          (o) => o.pub_id === p.id && o.active,
                        ),
                        offer =
                          offers.find((o) => o.category === category) ??
                          offers[0];
                      return (
                        <article className="pub-card" key={p.id}>
                          <div className="pub-card-photo">
                            <button
                              className="photo-open"
                              onClick={() => setPub(p)}
                              aria-label={`Conhecer ${p.name}`}
                            >
                              <img
                                src={p.image}
                                alt={`Ambiente ilustrativo de ${p.name}`}
                                loading="lazy"
                                style={{
                                  objectPosition:
                                    index === 2 ? "center 58%" : undefined,
                                }}
                              />
                            </button>
                            <span className="pub-photo-badge">
                              <span />
                              {offer?.category ?? "Benefícios"}
                            </span>
                            <button
                              className={`heart-button ${favorites.includes(p.id) ? "saved" : ""}`}
                              onClick={() => toggleFavorite(p.id)}
                              aria-pressed={favorites.includes(p.id)}
                              aria-label={`${favorites.includes(p.id) ? "Remover" : "Salvar"} ${p.name} nos favoritos`}
                            >
                              <Heart
                                size={18}
                                fill={
                                  favorites.includes(p.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                          </div>
                          <div className="pub-card-body">
                            <div className="pub-meta">
                              <MapPin size={13} />
                              {p.neighborhood}
                              {location && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  {distanceTo(p, location).toLocaleString(
                                    "pt-BR",
                                    { maximumFractionDigits: 1 },
                                  )}{" "}
                                  km
                                </span>
                              )}
                            </div>
                            <button
                              className="pub-name-button"
                              onClick={() => setPub(p)}
                            >
                              <h3>{p.name}</h3>
                              <ArrowUpRight size={19} />
                            </button>
                            <p className="pub-description">
                              {p.tags.join(" · ")}
                            </p>
                            {offer && (
                              <button
                                className="offer-strip"
                                onClick={() => setPub(p)}
                              >
                                <Ticket size={20} />
                                <span>
                                  <small>TEU BENEFÍCIO</small>
                                  <strong>{offer.subtitle}</strong>
                                </span>
                                <ArrowRight size={18} />
                              </button>
                            )}
                            <button
                              className="pub-card-cta"
                              onClick={() => setPub(p)}
                            >
                              Conhecer o pub <ArrowRight size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className="how-banner content-width">
                <div className="how-banner-icon">
                  <Ticket size={34} />
                </div>
                <div>
                  <span className="eyebrow small-eyebrow">
                    MENOS COMPLICAÇÃO. MAIS ENCONTRO.
                  </span>
                  <h2>
                    Escolheu. Ativou. <em>Brindou.</em>
                  </h2>
                  <p>O benefício vai contigo. É só mostrar o cupom no caixa.</p>
                </div>
                <button
                  className="button button-outline"
                  onClick={() => setHow(true)}
                >
                  Vê como funciona <ArrowUpRight size={17} />
                </button>
              </section>
            </>
          ) : (
            <section className="coupons-page content-width">
              <span className="eyebrow">OS BONS ENCONTROS FICAM</span>
              <h1>
                Teus <em>cupons.</em>
              </h1>
              <p className="page-intro">
                Os benefícios que tu ativou e os brindes que já aconteceram.
              </p>
              {!viewer ? (
                <div className="empty-state">
                  <UserRound size={36} />
                  <h3>Entra pra ver teus cupons.</h3>
                  <button
                    className="button button-amber"
                    onClick={() => setAccount(true)}
                  >
                    Entrar na minha conta
                  </button>
                </div>
              ) : myCoupons.length === 0 ? (
                <div className="empty-state">
                  <Ticket size={40} />
                  <h3>O primeiro brinde te espera.</h3>
                  <p>
                    Explora os pubs e ativa uma oferta quando estiver pronto
                    para usar.
                  </p>
                  <button
                    className="button button-amber"
                    onClick={() => setView("explore")}
                  >
                    Encontrar um pub <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <div className="my-coupons">
                  {myCoupons.map((r) => {
                    const status = effectiveStatus(r);
                    return (
                      <button
                        className={`my-coupon coupon-${status}`}
                        key={r.id}
                        onClick={() => setTicketId(r.id)}
                      >
                        <div className="coupon-list-symbol">
                          <Ticket size={27} />
                        </div>
                        <div>
                          <small>
                            {data.pubs.find((p) => p.id === r.pub_id)?.name}
                          </small>
                          <h3>{r.offer_title}</h3>
                          <span>{r.code}</span>
                        </div>
                        <span className={`status-pill status-${status}`}>
                          {status === "active"
                            ? "Ativo"
                            : status === "redeemed"
                              ? "Utilizado"
                              : status === "expired"
                                ? "Expirado"
                                : "Cancelado"}
                        </span>
                        <ArrowUpRight size={19} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      )}
      <footer className="site-footer content-width">
        <div>
          <Brand small />
          <p>Os melhores encontros começam com um convite.</p>
        </div>
        <div className="footer-middle">
          <span>
            <MapPin size={14} /> Feito para Porto Alegre
          </span>
          <span>18+ · Aprecia com moderação.</span>
        </div>
        <button className="install-button" onClick={() => setInstall(true)}>
          <Download size={16} /> Instalar Cevaí <ArrowUpRight size={15} />
        </button>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Cevaí</span>
          <span>Desenvolvido por Braian L. Saldanha</span>
        </div>
      </footer>
      {area === "client" && (
        <nav className="mobile-nav" aria-label="Navegação do aplicativo">
          <button
            className={view === "explore" && !mapView ? "active" : ""}
            onClick={() => {
              setView("explore");
              setMapView(false);
            }}
          >
            <Compass size={21} />
            <span>Explorar</span>
          </button>
          <button
            className={view === "explore" && mapView ? "active" : ""}
            onClick={() => {
              setView("explore");
              setMapView(true);
              setTimeout(
                () =>
                  document
                    .getElementById("explorar")
                    ?.scrollIntoView({ behavior: "smooth" }),
                60,
              );
            }}
          >
            <MapIcon size={21} />
            <span>Mapa</span>
          </button>
          <button
            className={view === "coupons" ? "active" : ""}
            onClick={() => setView("coupons")}
          >
            <span className="mobile-ticket-icon">
              <Ticket size={21} />
              {activeCouponCount > 0 && <i>{activeCouponCount}</i>}
            </span>
            <span>Cupons</span>
          </button>
          <button onClick={() => setAccount(true)}>
            <UserRound size={21} />
            <span>Conta</span>
          </button>
        </nav>
      )}
      {pub && (
        <Modal
          title="Conhece teu próximo encontro."
          onClose={() => setPub(null)}
          wide
        >
          <div className="pub-detail">
            <img
              className="pub-detail-photo"
              src={pub.image}
              alt={`Ambiente ilustrativo de ${pub.name}`}
            />
            <div className="pub-detail-heading">
              <div>
                <span className="eyebrow small-eyebrow">
                  <MapPin size={13} />
                  {pub.neighborhood} · Porto Alegre
                </span>
                <h2>{pub.name}</h2>
              </div>
              <button
                className={`icon-button ${favorites.includes(pub.id) ? "is-favorite" : ""}`}
                aria-label="Salvar pub nos favoritos"
                aria-pressed={favorites.includes(pub.id)}
                onClick={() => toggleFavorite(pub.id)}
              >
                <Heart
                  fill={favorites.includes(pub.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <p className="detail-description">{pub.description}</p>
            <div className="detail-tags">
              {pub.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            {repo.demo && (
              <p className="demo-inline">
                <Info size={14} /> Pub fictício para testar a experiência do
                Cevaí.
              </p>
            )}
            <a
              className="directions-link"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pub.lat},${pub.lng}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={16} />
              {repo.demo ? "Ver região no mapa" : "Como chegar"}
              <ArrowUpRight size={15} />
            </a>
            <div className="detail-divider" />
            <div className="detail-offers-heading">
              <h3>Um benefício pra chamar de teu.</h3>
              <Ticket size={22} />
            </div>
            <p className="detail-offers-caption">
              Confere as regras. Ativa só na hora de usar.
            </p>
            <div className="detail-offers">
              {data.offers
                .filter((o) => o.pub_id === pub.id && o.active)
                .map((o) => {
                  const left = available(o, data.redemptions),
                    window = offerWindow(o);
                  return (
                    <div className="detail-offer" key={o.id}>
                      <div className="detail-offer-top">
                        <span className="offer-category">{o.category}</span>
                        <span className="offer-availability">
                          {repo.demo
                            ? `${left} disponíveis na prévia`
                            : `Limite de ${o.daily_limit} por dia`}
                        </span>
                      </div>
                      <h4>{o.title}</h4>
                      <strong>{o.subtitle}</strong>
                      <p>{o.description}</p>
                      <div className="offer-rule">
                        <ShieldCheck size={15} />
                        <span>{o.rule}</span>
                      </div>
                      <div className="offer-hours">
                        <Clock3 size={14} />
                        {o.days.length === 7
                          ? "Todos os dias"
                          : o.days
                              .map(
                                (d) =>
                                  [
                                    "Dom",
                                    "Seg",
                                    "Ter",
                                    "Qua",
                                    "Qui",
                                    "Sex",
                                    "Sáb",
                                  ][d],
                              )
                              .join(", ")}{" "}
                        · {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)}
                      </div>
                      <button
                        className="button button-amber full"
                        disabled={
                          busy === o.id ||
                          !online ||
                          (!repo.demo && !window.open) ||
                          left === 0
                        }
                        onClick={() => void activate(o)}
                      >
                        {busy === o.id ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Ticket size={17} />
                        )}{" "}
                        {busy === o.id
                          ? "Ativando..."
                          : left === 0
                            ? "Esgotado por hoje"
                            : !window.open
                              ? "Fora do horário"
                              : "Ativar para usar agora"}
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </Modal>
      )}
      {redemption && (
        <CouponTicket
          redemption={redemption}
          pub={data.pubs.find((p) => p.id === redemption.pub_id)}
          onClose={() => setTicketId(null)}
          onCancel={async () => {
            try {
              await repo.cancel(redemption.id);
              await reload();
            } catch {
              notify("Não foi possível cancelar. Tenta novamente.");
            }
          }}
          notify={notify}
        />
      )}
      {how && <HowItWorks onClose={() => setHow(false)} />}
      {account && (
        <AccountDialog
          repository={repo}
          viewer={viewer}
          onClose={() => setAccount(false)}
          refresh={reload}
          notify={notify}
        />
      )}
      {install && (
        <Modal title="O Cevaí vai contigo." onClose={() => setInstall(false)}>
          <div className="install-content">
            <img src="/assets/app-icon-192.png" alt="Ícone Cevaí" />
            <h3>Teu rolê a um toque.</h3>
            <p>
              Adiciona o Cevaí à tela inicial do celular para abrir como
              aplicativo.
            </p>
            {prompt ? (
              <button
                className="button button-amber full"
                onClick={async () => {
                  await prompt.prompt();
                  const choice = await prompt.userChoice;
                  if (choice.outcome === "accepted")
                    notify("Cevaí adicionado ao teu celular!");
                  setPrompt(null);
                  setInstall(false);
                }}
              >
                <Download size={18} /> Instalar aplicativo
              </button>
            ) : (
              <div className="install-instructions">
                <p>
                  <strong>No iPhone</strong>
                  <br />
                  Abre no Safari, toca em Compartilhar e depois em “Adicionar à
                  Tela de Início”.
                </p>
                <p>
                  <strong>No Android</strong>
                  <br />
                  Abre no Chrome, toca no menu ⋮ e procura “Instalar app” ou
                  “Adicionar à tela inicial”.
                </p>
              </div>
            )}
            <p className="fine-print">
              A instalação depende do navegador. Os cupons precisam de conexão
              para ativar e validar.
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

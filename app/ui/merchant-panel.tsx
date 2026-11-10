"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Beer,
  Camera,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  ClipboardList,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Plus,
  ScanLine,
  ShieldCheck,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import { available, effectiveStatus, localDay } from "../../lib/coupon-engine";
import type {
  NewOffer,
  Redemption,
  Snapshot,
  Staff,
  Viewer,
} from "../../lib/types";
import type { Repository } from "../../lib/repository";
import { Modal } from "./shared";

type Detector = {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};
function CameraScan({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    codeCallback = useRef(onCode),
    [error, setError] = useState("");
  useEffect(() => { codeCallback.current = onCode; }, [onCode]);
  useEffect(() => {
    let stopped = false,
      stream: MediaStream | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      try {
        const Constructor = (
          window as unknown as {
            BarcodeDetector?: new (options: { formats: string[] }) => Detector;
          }
        ).BarcodeDetector;
        if (!Constructor)
          throw new Error(
            "Este navegador não oferece leitura de QR pela câmera. Usa o código escrito ou um leitor QR USB.",
          );
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Constructor({ formats: ["qr_code"] });
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            if (video.current.readyState >= 2) {
              const codes = await detector.detect(video.current);
              if (codes[0]) {
                stopped = true;
                stream?.getTracks().forEach((t) => t.stop());
                codeCallback.current(codes[0].rawValue);
                return;
              }
            }
          } catch {
            /* Wait for a readable frame. */
          }
          timer = setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível abrir a câmera. Confere a permissão do navegador.",
        );
      }
    };
    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <Modal title="Ler QR do cliente" onClose={onClose}>
      {error ? (
        <div className="camera-error">
          <Camera size={35} />
          <p>{error}</p>
          <button className="button button-amber full" onClick={onClose}>
            Digitar código
          </button>
        </div>
      ) : (
        <>
          <video className="qr-video" ref={video} playsInline muted />
          <p className="fine-print">
            Enquadra o QR Code que aparece na tela do cliente.
          </p>
        </>
      )}
    </Modal>
  );
}

export default function MerchantPanel({
  repository,
  snapshot,
  viewer,
  staff,
  reload,
  notify,
  onLogin,
  online,
}: {
  repository: Repository;
  snapshot: Snapshot;
  viewer: Viewer | null;
  staff: Staff[];
  reload: () => Promise<void>;
  notify: (message: string) => void;
  onLogin: () => void;
  online: boolean;
}) {
  const [tab, setTab] = useState<"validate" | "offers" | "results">("validate"),
    [selected, setSelected] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Redemption | null>(null),
    [create, setCreate] = useState(false),
    [createPub, setCreatePub] = useState(false),
    [camera, setCamera] = useState(false),
    [pubLocation, setPubLocation] = useState<[number, number] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const allowed = snapshot.pubs.filter((p) =>
      staff.some((s) => s.pub_id === p.id),
    ),
    pub = allowed.find((p) => p.id === selected) ?? allowed[0];
  const role = staff.find((s) => s.pub_id === pub?.id)?.role,
    canManage = role === "owner" || role === "manager";
  useEffect(() => {
    if (tab === "validate" && !create && !camera) input.current?.focus();
  }, [tab, create, camera, pub?.id]);
  const offers = snapshot.offers.filter((o) => o.pub_id === pub?.id),
    redemptions = snapshot.redemptions.filter((r) => r.pub_id === pub?.id),
    today = redemptions.filter((r) => r.redemption_day === localDay()),
    used = today.filter((r) => r.status === "redeemed"),
    active = today.filter((r) => effectiveStatus(r) === "active"),
    recent = redemptions
      .filter((r) => r.status === "redeemed")
      .sort((a, b) => Date.parse(b.redeemed_at!) - Date.parse(a.redeemed_at!))
      .slice(0, 5);
  const validate = async (value = code) => {
    if (!pub || busy) return;
    if (!online) {
      setError("Sem conexão. Reconecta antes de validar o cupom.");
      return;
    }
    if (!value.trim()) {
      input.current?.focus();
      return;
    }
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const redeemed = await repository.redeem(pub.id, value);
      setResult(redeemed);
      setCode("");
      await reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível validar. Tenta novamente.",
      );
      input.current?.select();
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };
  return (
    <main className="merchant-page content-width">
      <div className="merchant-heading">
        <div>
          <span className="eyebrow">
            <Store size={14} /> ÁREA DO PUB
          </span>
          <h1>
            Bom pra quem vem.
            <br />
            <em>Melhor pro teu pub.</em>
          </h1>
        </div>
        {pub && (
          <label className="pub-select-label">
            <span>Teu estabelecimento</span>
            <select
              value={pub.id}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
                setError("");
              }}
            >
              {allowed.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!viewer ? (
        <div className="empty-state">
          <ShieldCheck size={42} />
          <h3>O balcão começa por aqui.</h3>
          <p>
            Entra na tua conta para gerenciar as ofertas e validar cupons do teu
            pub.
          </p>
          <button className="button button-amber" onClick={onLogin}>
            Entrar na área do pub <ArrowRight size={17} />
          </button>
        </div>
      ) : !pub ? (
        <div className="empty-state">
          <Store size={42} />
          <h3>Vamos colocar teu pub no mapa?</h3>
          <p>Cadastra teu estabelecimento para criar a primeira oferta.</p>
          <button
            className="button button-amber"
            onClick={() => setCreatePub(true)}
          >
            Cadastrar meu pub <Plus size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="merchant-tabs" role="group" aria-label="Áreas do pub">
            <button
              className={tab === "validate" ? "active" : ""}
              onClick={() => setTab("validate")}
            >
              <ScanLine size={18} /> Validar cupom
            </button>
            {canManage && (
              <button
                className={tab === "offers" ? "active" : ""}
                onClick={() => setTab("offers")}
              >
                <Ticket size={18} /> Minhas ofertas
              </button>
            )}
            {canManage && (
              <button
                className={tab === "results" ? "active" : ""}
                onClick={() => setTab("results")}
              >
                <LayoutDashboard size={18} /> Resultados
              </button>
            )}
          </div>
          {tab === "validate" ? (
            <div className="cashier-layout">
              <section className="cashier-terminal">
                <div className="terminal-title">
                  <span className="terminal-icon">
                    <ScanLine size={26} />
                  </span>
                  <div>
                    <h2>Um código. Um benefício.</h2>
                    <p>Digita o código ou usa teu leitor de QR.</p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void validate();
                  }}
                >
                  <label className="code-label" htmlFor="cashier-code">
                    CÓDIGO DO CLIENTE
                  </label>
                  <input
                    id="cashier-code"
                    className="cashier-code-input"
                    value={code}
                    ref={input}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="CEV-7K9M"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-describedby="cashier-hint"
                  />
                  <div className="cashier-actions">
                    <button
                      className="button button-amber"
                      disabled={busy || !online || !code.trim()}
                    >
                      {busy ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <Check size={20} />
                      )}{" "}
                      {busy ? "Validando..." : "Validar cupom"}
                    </button>
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => setCamera(true)}
                      disabled={!online}
                    >
                      <Camera size={18} /> Ler QR
                    </button>
                  </div>
                  <p id="cashier-hint" className="fine-print">
                    <ShieldCheck size={14} /> Cada código pode ser validado uma
                    única vez.
                  </p>
                </form>
                {error && (
                  <div
                    className="validation-result validation-error"
                    role="alert"
                  >
                    <CircleX size={34} />
                    <div>
                      <strong>Não foi possível validar</strong>
                      <p>{error}</p>
                    </div>
                  </div>
                )}
                {result && (
                  <div
                    className="validation-result validation-success"
                    role="status"
                  >
                    <CircleCheck size={42} />
                    <div>
                      <span>CUPOM VALIDADO</span>
                      <strong>{result.offer_title}</strong>
                      <p>Aplica o benefício na comanda do cliente.</p>
                      <small>{result.code}</small>
                    </div>
                  </div>
                )}
                <div className="terminal-footer">
                  <span
                    className={online ? "connection-dot" : "connection-dot off"}
                  />
                  {online ? "Pronto para validar" : "Aguardando conexão"}
                  <span>
                    {repository.demo
                      ? "Terminal de demonstração"
                      : "Validação online"}
                  </span>
                </div>
              </section>
              <aside className="cashier-side">
                <div className="counter-card">
                  <span>RESGATES HOJE</span>
                  <strong>{used.length.toString().padStart(2, "0")}</strong>
                  <p>Benefícios confirmados no teu pub.</p>
                  <div>
                    <Ticket size={16} />
                    {active.length}{" "}
                    {active.length === 1 ? "cupom ativo" : "cupons ativos"}{" "}
                    aguardando validação
                  </div>
                </div>
                <div className="cashier-tip">
                  <Beer size={26} />
                  <h3>
                    Atendimento leve.
                    <br />
                    Encontro garantido.
                  </h3>
                  <p>
                    Depois de validar, aplica o benefício no pedido ou na
                    comanda. O Cevaí não altera o teu sistema de caixa.
                  </p>
                </div>
              </aside>
              <section className="recent-validations">
                <div>
                  <h3>Últimos brindes confirmados</h3>
                  <span>Últimas 5 validações</span>
                </div>
                {recent.length === 0 ? (
                  <div className="recent-empty">
                    <ClipboardList size={25} />
                    <p>As primeiras validações vão aparecer aqui.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Horário</th>
                          <th>Código</th>
                          <th>Benefício</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {new Date(r.redeemed_at!).toLocaleTimeString(
                                "pt-BR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "America/Sao_Paulo",
                                },
                              )}
                            </td>
                            <td>
                              <code>{r.code}</code>
                            </td>
                            <td>{r.offer_title}</td>
                            <td>
                              <span className="status-pill status-redeemed">
                                <Check size={13} /> Validado
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : tab === "offers" && canManage ? (
            <section className="offers-manager">
              <div className="manager-section-heading">
                <div>
                  <h2>Teus convites pro próximo brinde.</h2>
                  <p>
                    Cria benefícios, define os limites e escolhe quando
                    oferecer.
                  </p>
                </div>
                <button
                  className="button button-amber"
                  onClick={() => setCreate(true)}
                >
                  <Plus size={18} /> Criar oferta
                </button>
              </div>
              {offers.length === 0 ? (
                <div className="empty-state">
                  <Ticket size={38} />
                  <h3>A primeira oferta começa contigo.</h3>
                  <button
                    className="button button-outline"
                    onClick={() => setCreate(true)}
                  >
                    Criar primeiro cupom
                  </button>
                </div>
              ) : (
                <div className="managed-offer-grid">
                  {offers.map((o) => (
                    <article className="managed-offer" key={o.id}>
                      <div className="managed-offer-top">
                        <span
                          className={`status-pill ${o.active ? "status-active" : "status-cancelled"}`}
                        >
                          {o.active ? "Ativa" : "Pausada"}
                        </span>
                        <Ticket size={25} />
                      </div>
                      <span className="offer-category">{o.category}</span>
                      <h3>{o.subtitle}</h3>
                      <p>{o.description}</p>
                      <div className="offer-schedule">
                        <Clock3 size={15} />
                        {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)} ·{" "}
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
                              .join(", ")}
                      </div>
                      <div className="offer-quota">
                        <span>Limite diário</span>
                        <strong>{o.daily_limit} cupons</strong>
                      </div>
                      <div className="offer-quota">
                        <span>
                          {repository.demo
                            ? "Disponíveis na prévia"
                            : "Reservas e resgates visíveis"}
                        </span>
                        <strong>
                          {repository.demo
                            ? available(o, redemptions)
                            : today.filter(
                                (r) =>
                                  r.offer_id === o.id &&
                                  ["active", "redeemed"].includes(
                                    effectiveStatus(r),
                                  ),
                              ).length}
                        </strong>
                      </div>
                      <button
                        className="button button-outline full"
                        onClick={async () => {
                          try {
                            await repository.toggleOffer(o.id, !o.active);
                            await reload();
                            notify(
                              o.active
                                ? "Oferta pausada. Cupons já ativos continuam válidos."
                                : "Oferta ativada!",
                            );
                          } catch {
                            notify("Não foi possível alterar a oferta.");
                          }
                        }}
                      >
                        {o.active ? <Pause size={16} /> : <Play size={16} />}{" "}
                        {o.active ? "Pausar oferta" : "Ativar oferta"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : canManage ? (
            <section className="results-section">
              <div className="manager-section-heading">
                <div>
                  <h2>Os encontros em números.</h2>
                  <p>
                    Resgates registrados no teu pub. Sem estimativas de venda.
                  </p>
                </div>
                <span className="period-chip">Hoje · Porto Alegre</span>
              </div>
              <div className="results-cards">
                <article>
                  <Ticket size={22} />
                  <span>Cupons validados</span>
                  <strong>{used.length}</strong>
                  <p>Benefícios confirmados hoje</p>
                </article>
                <article>
                  <Users size={22} />
                  <span>Contas que resgataram</span>
                  <strong>{new Set(used.map((r) => r.user_id)).size}</strong>
                  <p>Cadastros distintos hoje</p>
                </article>
                <article>
                  <Clock3 size={22} />
                  <span>Aguardando no balcão</span>
                  <strong>{active.length}</strong>
                  <p>Cupons ativos neste momento</p>
                </article>
              </div>
              <div className="results-detail">
                <h3>Resgates por oferta</h3>
                {offers.length === 0 ? (
                  <p>
                    Cria uma oferta para começar a acompanhar os resultados.
                  </p>
                ) : (
                  offers.map((o) => {
                    const count = used.filter(
                      (r) => r.offer_id === o.id,
                    ).length;
                    return (
                      <div className="offer-result-row" key={o.id}>
                        <div>
                          <span>{o.subtitle}</span>
                          <div className="result-bar">
                            <span
                              style={{
                                width: `${Math.min(100, (count / o.daily_limit) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <strong>
                          {count}
                          <small> / {o.daily_limit}</small>
                        </strong>
                      </div>
                    );
                  })
                )}
                <p className="fine-print">
                  Um resgate indica uso de benefício. Ele não comprova uma
                  visita ou venda adicional.
                </p>
              </div>
            </section>
          ) : null}
        </>
      )}
      {create && pub && (
        <OfferForm
          pubId={pub.id}
          onClose={() => setCreate(false)}
          save={async (offer) => {
            await repository.createOffer(offer);
            await reload();
            setCreate(false);
            notify("Oferta criada! Já pode aparecer para os clientes.");
          }}
        />
      )}
      {createPub && (
        <Modal
          title="Teu pub no próximo rolê."
          onClose={() => setCreatePub(false)}
        >
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pubLocation) {
                notify(
                  "Marca a localização do estabelecimento antes de cadastrar.",
                );
                return;
              }
              setBusy(true);
              const fields = new FormData(e.currentTarget);
              try {
                await repository.createPub({
                  name: String(fields.get("name")),
                  neighborhood: String(fields.get("neighborhood")),
                  address: String(fields.get("address")),
                  description: String(fields.get("description")),
                  image: "/assets/pub-interior.webp",
                  lat: pubLocation[0],
                  lng: pubLocation[1],
                  tags: ["Pub"],
                });
                await reload();
                setCreatePub(false);
                notify("Pub cadastrado. Cria tua primeira oferta!");
              } catch (err) {
                notify(
                  err instanceof Error
                    ? err.message
                    : "Não foi possível cadastrar o pub.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nome do pub
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Bairro
              <select name="neighborhood">
                <option>Cidade Baixa</option>
                <option>Bom Fim</option>
                <option>Moinhos de Vento</option>
                <option>Centro Histórico</option>
                <option>Auxiliadora</option>
                <option>Menino Deus</option>
              </select>
            </label>
            <label>
              Endereço completo
              <input name="address" required maxLength={250} />
            </label>
            <label>
              Conta um pouco sobre o pub
              <textarea name="description" required maxLength={500} rows={3} />
            </label>
            <button
              type="button"
              className="button button-outline full"
              onClick={() => {
                if (!navigator.geolocation) {
                  notify("Este navegador não oferece localização.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    setPubLocation([
                      position.coords.latitude,
                      position.coords.longitude,
                    ]);
                    notify(
                      "Localização marcada. Confere se tu está no estabelecimento.",
                    );
                  },
                  () =>
                    notify(
                      "Não foi possível marcar a localização. Confere a permissão do navegador.",
                    ),
                  { enableHighAccuracy: true, timeout: 12000 },
                );
              }}
            >
              <MapPin size={17} />
              {pubLocation
                ? "Localização marcada · atualizar"
                : "Marcar localização do estabelecimento"}
            </button>
            <p className="fine-print">
              Faz o cadastro quando estiver no pub para marcar o ponto correto
              no mapa.
            </p>
            <button className="button button-amber full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Store size={17} />
              )}{" "}
              Cadastrar pub
            </button>
          </form>
        </Modal>
      )}
      {camera && (
        <CameraScan
          onClose={() => setCamera(false)}
          onCode={(value) => {
            setCamera(false);
            setCode(value);
            void validate(value);
          }}
        />
      )}
    </main>
  );
}

function OfferForm({
  pubId,
  onClose,
  save,
}: {
  pubId: string;
  onClose: () => void;
  save: (offer: NewOffer) => Promise<void>;
}) {
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Um novo motivo pra brindar." onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!days.length) {
            setError("Escolhe pelo menos um dia da semana.");
            return;
          }
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await save({
              pub_id: pubId,
              title: String(fields.get("title")).trim(),
              subtitle: String(fields.get("subtitle")).trim(),
              description: String(fields.get("description")).trim(),
              category: String(fields.get("category")),
              rule: String(fields.get("rule")).trim(),
              days,
              start_time: String(fields.get("start")),
              end_time: String(fields.get("end")),
              daily_limit: Number(fields.get("limit")),
              active: true,
            });
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível criar a oferta.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome da campanha
          <input
            name="title"
            placeholder="Ex.: Pediu um, brindou dois."
            minLength={3}
            maxLength={100}
            required
          />
        </label>
        <label>
          Benefício que aparece no caixa
          <input
            name="subtitle"
            placeholder="Ex.: Chopp Pilsen 500 ml em dobro"
            minLength={5}
            maxLength={140}
            required
          />
        </label>
        <label>
          Categoria
          <select name="category">
            <option>Chopp em dobro</option>
            <option>Happy hour</option>
            <option>Petiscos</option>
            <option>Primeira visita</option>
          </select>
        </label>
        <label>
          Descrição
          <textarea
            name="description"
            rows={2}
            maxLength={600}
            required
            placeholder="Explica o que o cliente vai aproveitar."
          />
        </label>
        <label>
          Regras de utilização
          <textarea
            name="rule"
            rows={2}
            maxLength={600}
            required
            placeholder="Informa limites e se precisa validar antes do pedido ou no pagamento."
          />
        </label>
        <fieldset>
          <legend>Dias da semana</legend>
          <div className="day-selector">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day, i) => (
              <button
                type="button"
                aria-pressed={days.includes(i)}
                className={days.includes(i) ? "active" : ""}
                key={day}
                onClick={() =>
                  setDays(
                    days.includes(i)
                      ? days.filter((d) => d !== i)
                      : [...days, i],
                  )
                }
              >
                {day}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="form-columns">
          <label>
            Início
            <input name="start" type="time" defaultValue="00:00" required />
          </label>
          <label>
            Fim
            <input name="end" type="time" defaultValue="23:59" required />
          </label>
        </div>
        <label>
          Limite diário de cupons
          <input
            name="limit"
            type="number"
            defaultValue={30}
            min={1}
            max={10000}
            required
          />
        </label>
        <p className="fine-print">
          Reservas ativas e cupons usados ocupam o limite. Reservas expiradas
          liberam disponibilidade. Pausar não invalida cupons já ativos.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-amber full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Plus size={18} />
          )}{" "}
          {busy ? "Criando..." : "Publicar oferta"}
        </button>
      </form>
    </Modal>
  );
}

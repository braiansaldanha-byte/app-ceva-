"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  X,
  Beer,
  Copy,
  Check,
  CircleCheck,
  Clock3,
  LoaderCircle,
  Mail,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { effectiveStatus } from "../../lib/coupon-engine";
import type { Pub, Redemption, Viewer } from "../../lib/types";
import type { Repository } from "../../lib/repository";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <a
      href="/"
      className={`brand ${small ? "brand-small" : ""}`}
      aria-label="Cevaí, início"
    >
      <img src="/assets/app-icon-192.png" alt="" />
      <span>cevaí</span>
      <span className="brand-period">.</span>
    </a>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-top">
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Teu rolê, sem complicar." onClose={onClose}>
      <div className="how-steps">
        {[
          [
            "01",
            "Escolhe teu próximo encontro",
            "Explora os pubs e confere os benefícios e as regras de cada oferta.",
          ],
          [
            "02",
            "Tá na hora? Ativa o cupom",
            "Ativa só quando estiver pronto para usar. O código vale por até 15 minutos.",
          ],
          [
            "03",
            "Mostra no caixa e aproveita",
            "A equipe valida o código e aplica o benefício na tua comanda.",
          ],
        ].map(([n, title, text]) => (
          <div key={n} className="how-step">
            <span>{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="fine-print">
        <ShieldCheck size={16} /> Confere se a oferta deve ser validada no
        pedido ou no pagamento.
      </p>
      <button className="button button-amber full" onClick={onClose}>
        Bora explorar <Beer size={18} />
      </button>
    </Modal>
  );
}
export function CouponTicket({
  redemption,
  pub,
  onClose,
  onCancel,
  notify,
}: {
  redemption: Redemption;
  pub?: Pub;
  onClose: () => void;
  onCancel: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [now, setNow] = useState(Date.now()),
    [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false),
    [cancelling, setCancelling] = useState(false);
  const status = effectiveStatus(redemption, now),
    previous = useRef(status);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`cevai:${redemption.token}`, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#102f27", light: "#ffffff" },
    })
      .then((src) => {
        if (alive) setQr(src);
      })
      .catch(() =>
        notify("Não foi possível mostrar o QR. Usa o código escrito abaixo."),
      );
    return () => {
      alive = false;
    };
  }, [redemption.token, notify]);
  useEffect(() => {
    if (
      status === "redeemed" &&
      previous.current !== "redeemed" &&
      navigator.vibrate
    )
      navigator.vibrate([100, 60, 100]);
    previous.current = status;
  }, [status]);
  useEffect(() => {
    if (status !== "active" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined,
      alive = true;
    const acquire = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next = await navigator.wakeLock.request("screen");
          if (!alive) void next.release();
          else lock = next;
        } catch {
          /* Optional capability. */
        }
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false;
      void lock?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [status]);
  const remaining = Math.max(
      0,
      Math.ceil((Date.parse(redemption.expires_at) - now) / 1000),
    ),
    timer = `${Math.floor(remaining / 60)
      .toString()
      .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redemption.code);
      setCopied(true);
    } catch {
      notify("Seleciona e copia o código que aparece na tela.");
    }
  };
  return (
    <Modal
      title={status === "redeemed" ? "Brinde confirmado!" : "Teu cupom"}
      onClose={onClose}
    >
      <div className={`coupon-ticket ticket-${status}`}>
        <div className="ticket-pub">
          <img src="/assets/app-icon-192.png" alt="" />
          <span>{pub?.name ?? "Cevaí"}</span>
        </div>
        <h3>{redemption.offer_title}</h3>
        {status === "active" ? (
          <>
            <p className="ticket-caption">Mostra no caixa para validar.</p>
            <div className="qr-frame">
              {qr ? (
                <img
                  src={qr}
                  width="228"
                  height="228"
                  alt="QR Code de uso único do cupom"
                />
              ) : (
                <LoaderCircle className="spin" />
              )}
            </div>
            <div className="ticket-code">
              {redemption.code}
              <button
                className="icon-button"
                onClick={copy}
                aria-label="Copiar código"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <div className={`ticket-timer ${remaining < 120 ? "urgent" : ""}`}>
              <Clock3 size={18} /> <strong>{timer}</strong>
              <span>para validar</span>
            </div>
            <div className="timer-track">
              <span
                style={{ width: `${Math.min(100, (remaining / 900) * 100)}%` }}
              />
            </div>
            <p className="fine-print">
              O prazo considera o encerramento da oferta. Reservar não aplica o
              desconto automaticamente.
            </p>
            <button
              className="text-button"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try {
                  await onCancel();
                } finally {
                  setCancelling(false);
                }
              }}
            >
              Cancelar cupom e liberar benefício
            </button>
          </>
        ) : (
          <div className="ticket-finish" role="status">
            <CircleCheck size={70} />
            <h4>
              {status === "redeemed"
                ? "Cupom validado!"
                : status === "expired"
                  ? "O prazo terminou"
                  : "Cupom cancelado"}
            </h4>
            <p>
              {status === "redeemed"
                ? "A equipe pode aplicar o benefício na tua comanda. Aproveita o encontro!"
                : "A disponibilidade foi liberada. Tu pode conferir as ofertas novamente."}
            </p>
            <button className="button button-amber full" onClick={onClose}>
              Voltar ao rolê
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
export function AccountDialog({
  repository,
  viewer,
  onClose,
  refresh,
  notify,
}: {
  repository: Repository;
  viewer: Viewer | null;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        viewer ? "Tua conta" : signup ? "Chega mais!" : "Bom te ver por aqui."
      }
      onClose={onClose}
    >
      {repository.demo ? (
        <div className="account-content">
          <img
            className="account-icon"
            src="/assets/app-icon-192.png"
            alt="Símbolo do Cevaí"
          />
          <h3>Uma prévia do teu próximo rolê.</h3>
          <p>
            Esta versão usa pubs fictícios e guarda os testes neste navegador.
            Tu pode ativar cupons e validar na área do pub, sem criar uma conta.
          </p>
          <p className="note">
            O cadastro e o acesso real serão habilitados na conexão com o
            Supabase.
          </p>
          <button className="button button-amber full" onClick={onClose}>
            Continuar explorando
          </button>
        </div>
      ) : viewer ? (
        <div className="account-content">
          <div className="account-avatar">
            {viewer.name.slice(0, 1).toUpperCase()}
          </div>
          <h3>{viewer.name}</h3>
          <p>
            <Mail size={16} /> {viewer.email}
          </p>
          <button
            className="button button-outline full"
            onClick={async () => {
              try {
                await repository.signOut();
                await refresh();
                onClose();
              } catch {
                notify("Não foi possível sair. Tenta novamente.");
              }
            }}
          >
            <LogOut size={17} /> Sair da conta
          </button>
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            const fields = new FormData(e.currentTarget);
            try {
              if (signup) {
                const signedIn = await repository.signUp(
                  String(fields.get("email")),
                  String(fields.get("password")),
                  String(fields.get("name")),
                );
                if (!signedIn) {
                  notify(
                    "Confere teu e-mail para confirmar o cadastro antes de entrar.",
                  );
                  setSignup(false);
                  return;
                }
              } else
                await repository.signIn(
                  String(fields.get("email")),
                  String(fields.get("password")),
                );
              await refresh();
              onClose();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Não foi possível entrar. Confere os dados e tenta novamente.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label>
              Teu nome
              <input
                name="name"
                autoComplete="given-name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>
          {signup && (
            <label className="check-label">
              <input type="checkbox" required /> Confirmo que tenho 18 anos ou
              mais.
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-amber full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {signup ? "Criar minha conta" : "Entrar"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup
              ? "Já tem uma conta? Entra aqui."
              : "Primeira vez? Cria tua conta."}
          </button>
        </form>
      )}
    </Modal>
  );
}

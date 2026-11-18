"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { BusinessApplication } from "./super-admin-types";

type ReviewData = {
  application: Record<string, unknown>;
  account: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    lastSignInAt: string | null;
    bannedUntil: string | null;
    disabled: boolean;
  } | null;
  business: Record<string, unknown> | null;
  members: { userId: string; email: string; name: string; role: string; status: string; joinedAt: string }[];
  workspaceData: { table: string; count: number | null; records: Record<string, unknown>[]; error?: string }[];
  online: boolean;
};

type ActionResult = { error?: string; warning?: string; email?: string };

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return String(value);
  return JSON.stringify(value);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function BusinessApplicationReview({
  application,
  onClose,
  onNotify,
  onReview,
  onDeleted,
}: {
  application: BusinessApplication;
  onClose: () => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
  onReview: (application: BusinessApplication, status: "Under Review") => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loadingTables, setLoadingTables] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/business-applications/${encodeURIComponent(application.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as ReviewData & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Xogta codsiga lama soo qaadi karin.");
        if (active) {
          setData(result);
          setNewEmail(result.account?.email ?? application.email);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Xogta codsiga lama soo qaadi karin.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [application.email, application.id]);

  async function performAction(action: "send_password_reset" | "change_email" | "delete_permanently", extra: Record<string, unknown> = {}) {
    setBusy(true);
    if (action === "delete_permanently") setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/business-applications/${encodeURIComponent(application.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const result = await response.json() as ActionResult;
      if (!response.ok) throw new Error(result.error ?? "Ficilka lama dhammaystirin.");
      if (result.warning) onNotify(result.warning, "error");
      else if (action === "send_password_reset") onNotify("Password reset link waxaa loo diray email-ka ku qoran account-ka.");
      else if (action === "change_email") onNotify("Email-ka account-ka waa la cusboonaysiiyey.");
      else onNotify("Account-ka, codsiga iyo xogta business-ka si joogto ah ayaa database-ka looga tirtiray.");

      if (action === "delete_permanently") {
        onDeleted();
        return;
      }
      if (action === "change_email" && result.email && data) {
        setData({
          ...data,
          account: data.account ? { ...data.account, email: result.email } : data.account,
          application: { ...data.application, email: result.email },
        });
        setNewEmail(result.email);
        setConfirmed(false);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Ficilka lama dhammaystirin.");
    } finally {
      setBusy(false);
      if (action === "delete_permanently") setDeleting(false);
    }
  }

  function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performAction("change_email", { email: newEmail, confirmed });
  }

  function deletePermanently() {
    if (!window.confirm(`TIRTIRID JOOGTO AH: Ma tirtiraysaa ${application.businessName}, account-ka ${data?.account?.email ?? application.email}, dhammaan xogta workspace-ka, transactions-ka iyo sawirrada? Tallaabadan dib looma soo celin karo.`)) return;
    void performAction("delete_permanently");
  }

  async function loadMore(table: string, offset: number) {
    setLoadingTables((current) => ({ ...current, [table]: true }));
    setError("");
    try {
      const params = new URLSearchParams({ table, offset: String(offset) });
      const response = await fetch(
        `/api/admin/business-applications/${encodeURIComponent(application.id)}?${params}`,
        { cache: "no-store" },
      );
      const result = await response.json() as {
        dataset?: { table: string; count: number; records: Record<string, unknown>[] };
        error?: string;
      };
      if (!response.ok || !result.dataset) throw new Error(result.error ?? "Xog dheeraad ah lama soo qaadi karin.");
      setData((current) => current ? {
        ...current,
        workspaceData: current.workspaceData.map((dataset) => dataset.table === table ? {
          ...dataset,
          count: result.dataset?.count ?? dataset.count,
          records: [...dataset.records, ...(result.dataset?.records ?? [])],
        } : dataset),
      } : current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Xog dheeraad ah lama soo qaadi karin.");
    } finally {
      setLoadingTables((current) => ({ ...current, [table]: false }));
    }
  }

  return (
    <div
      className="admin-modal-backdrop"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section aria-label={`Review ${application.businessName}`} aria-modal="true" className="admin-modal business-review-modal" role="dialog">
        <header className="admin-modal-heading">
          <div>
            <div className="page-eyebrow">BUSINESS APPLICATION · REVIEW</div>
            <h2>{application.businessName}</h2>
            <p>{application.ownerName} · {application.email}</p>
          </div>
          <button aria-label="Xir review" className="modal-close" onClick={onClose} type="button">×</button>
        </header>

        {loading && <p className="form-hint" role="status">Xogta business-ka waa la soo rarayaa...</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && (
          <div className="business-review-content">
            <section className="business-review-block">
              <div className="business-review-title">
                <h3>Akoonka milkiilaha</h3>
                <span className={`presence-badge ${data.online ? "presence-online" : "presence-offline"}`}>
                  <i />{data.online ? "Online" : "Offline"}
                </span>
              </div>
              {data.account ? (
                <dl className="business-review-facts">
                  <div><dt>Magac</dt><dd>{data.account.name || application.ownerName}</dd></div>
                  <div><dt>Email-ka Auth</dt><dd>{data.account.email}</dd></div>
                  <div><dt>Account ID</dt><dd>{data.account.id}</dd></div>
                  <div><dt>La sameeyey</dt><dd>{dateTime(data.account.createdAt)}</dd></div>
                  <div><dt>Login-kii ugu dambeeyey</dt><dd>{dateTime(data.account.lastSignInAt)}</dd></div>
                  <div><dt>Xannibaadda Auth</dt><dd>{data.account.disabled ? "Gelitaanka waa la joojiyey" : "Ma xannibna"}</dd></div>
                </dl>
              ) : <p className="form-error">Auth account-ka milkiilaha lama helin.</p>}
              <div className="business-review-actions">
                <button className="button button-outline button-small" disabled={busy || !data.account} onClick={() => void performAction("send_password_reset")} type="button">
                  U dir password reset link
                </button>
                <button className="action-button action-danger" disabled={busy} onClick={deletePermanently} type="button">
                  {deleting ? "Waa la tirtirayaa..." : "Delete permanently"}
                </button>
              </div>
              <p className="form-hint">Password-ka hadda jira lama arki karo; Auth-ku ma kaydiyo password la soo bandhigi karo. Reset link ayaa user-ku ku samaysan karaa password cusub.</p>
              <form className="business-review-email-form" onSubmit={changeEmail}>
                <label htmlFor="business-owner-new-email">Beddel email-ka</label>
                <div className="business-review-email-controls">
                  <input disabled={!data.account || busy} id="business-owner-new-email" maxLength={254} onChange={(event) => { setNewEmail(event.target.value); setConfirmed(false); }} required type="email" value={newEmail} />
                  <button className="button button-dark button-small" disabled={busy || !data.account || !confirmed || newEmail.trim().toLowerCase() === data.account?.email.toLowerCase()} type="submit">Beddel</button>
                </div>
                <label className="business-review-confirm">
                  <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
                  Waxaan xaqiijiyey in user-ku codsaday isbeddelka oo uu leeyahay email-kan cusub.
                </label>
              </form>
            </section>

            <section className="business-review-block">
              <h3>Business application</h3>
              <dl className="business-review-facts">
                {Object.entries(data.application).map(([key, value]) => (
                  <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{display(value)}</dd></div>
                ))}
              </dl>
            </section>

            {data.business && (
              <section className="business-review-block">
                <h3>Business profile</h3>
                <dl className="business-review-facts">
                  {Object.entries(data.business).map(([key, value]) => (
                    <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{display(value)}</dd></div>
                  ))}
                </dl>
              </section>
            )}

            <section className="business-review-block">
              <h3>Workspace members ({data.members.length})</h3>
              {data.members.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-data-table">
                    <thead><tr><th>EMAIL</th><th>MAGAC</th><th>ROLE</th><th>STATUS</th><th>KU BIIRAY</th></tr></thead>
                    <tbody>{data.members.map((member) => (
                      <tr key={member.userId}>
                        <td>{member.email || member.userId}</td><td>{member.name || "—"}</td><td>{member.role}</td><td>{member.status}</td><td>{dateTime(member.joinedAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="form-hint">Business workspace weli lama abuurin ama xubno ma laha.</p>}
            </section>

            {data.business && (
              <section className="business-review-block">
                <h3>Xogta workspace-ka</h3>
                {data.workspaceData.map((dataset) => (
                  <details className="business-review-dataset" key={dataset.table}>
                    <summary>{dataset.table} · {dataset.error ? "lama soo qaadi karin" : `${dataset.count ?? 0} records`}</summary>
                    {dataset.error
                      ? <p className="form-error">{dataset.error}</p>
                      : dataset.records.length
                        ? <pre>{JSON.stringify(dataset.records, null, 2)}</pre>
                        : <p className="form-hint">Xog kuma jirto qaybtaan.</p>}
                    {!dataset.error && dataset.count !== null && dataset.count > dataset.records.length && (
                      <div className="business-review-more">
                        <p className="form-hint">Waxaa la muujiyey {dataset.records.length} ka mid ah {dataset.count} records.</p>
                        <button
                          className="button button-outline button-small"
                          disabled={Boolean(loadingTables[dataset.table])}
                          onClick={() => void loadMore(dataset.table, dataset.records.length)}
                          type="button"
                        >
                          {loadingTables[dataset.table] ? "Waa la soo rarayaa..." : "Soo rar 100 kale"}
                        </button>
                      </div>
                    )}
                  </details>
                ))}
              </section>
            )}
          </div>
        )}

        <footer className="admin-modal-footer">
          {application.status === "Pending" && (
            <button className="button button-outline" disabled={busy} onClick={() => onReview(application, "Under Review")} type="button">U wareeji Under Review</button>
          )}
          <button className="button button-outline" onClick={onClose} type="button">Xir</button>
        </footer>
      </section>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export type TeamMember = {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

const memberRoles = [
  { value: "business_admin", label: "Business admin" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "sales_staff", label: "Sales staff / Cashier" },
  { value: "inventory_manager", label: "Inventory manager" },
  { value: "employee", label: "Employee" },
];

const dateMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMemberDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${dateMonths[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export default function TeamManager({
  businessId,
  businessName,
  currentUserId,
  initialMembers,
  canInvite,
  canRemove,
}: {
  businessId: string;
  businessName: string;
  currentUserId: string;
  initialMembers: TeamMember[];
  canInvite: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const sharedPassword = String(data.get("sharedPassword") ?? "");
    if (sharedPassword !== data.get("confirmSharedPassword")) {
      setError("Labada meelood password-ku isku mid ma aha.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`/api/workspace/${businessId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          displayName: data.get("displayName"),
          role: data.get("role"),
          sharedPassword,
        }),
      });
      const result = await response.json() as { error?: string; email?: string; warning?: string };
      if (!response.ok) {
        setError(result.error ?? "Akoonka xubinta lama samayn.");
        return;
      }
      form.reset();
      setMessage(`Akoonka ${result.email} waa la sameeyay oo kooxda ayaa lagu daray. Email lama dirin; password-ka si ammaan ah ula wadaag.${result.warning ? ` ${result.warning}` : ""}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Server-ka lama gaari karin.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: TeamMember) {
    if (!window.confirm(`Ma hubtaa inaad ${member.email} ka saarayso ${businessName}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/workspace/${businessId}/team`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.user_id }),
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) {
        setError(result.error ?? "Xubinta lama saarin.");
        return;
      }
      setMessage(`${member.email} waa laga saaray workspace-kan.${result.warning ? ` ${result.warning}` : ""}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Server-ka lama gaari karin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="business-content">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE · TEAM</div>
          <h1>Kooxda {businessName}</h1>
          <p>Maamul xubnaha iyo rukhsadahooda workspace-kan oo keliya.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="workspace-notice" role="status">{message}</p>}
      {canInvite && (
        <section className="panel workspace-module-panel">
          <div className="section-heading"><div><span className="section-kicker">XUBIN CUSUB</span><h2>Kooxda ku dar</h2></div></div>
          <form className="workspace-module-form" onSubmit={addMember}>
            <label className="workspace-module-field" htmlFor="team-display-name">
              <span>Magaca *</span>
              <input autoComplete="name" id="team-display-name" maxLength={120} name="displayName" required />
            </label>
            <label className="workspace-module-field" htmlFor="team-email">
              <span>Email *</span>
              <input autoComplete="email" id="team-email" maxLength={254} name="email" required type="email" />
            </label>
            <label className="workspace-module-field" htmlFor="team-role">
              <span>Doorka *</span>
              <select id="team-role" name="role" required defaultValue="employee">
                {memberRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <label className="workspace-module-field" htmlFor="team-shared-password">
              <span>Password-ka ganacsiga *</span>
              <input autoComplete="new-password" id="team-shared-password" maxLength={72} minLength={12} name="sharedPassword" required type="password" />
            </label>
            <label className="workspace-module-field" htmlFor="team-confirm-shared-password">
              <span>Xaqiiji password-ka *</span>
              <input autoComplete="new-password" id="team-confirm-shared-password" maxLength={72} minLength={12} name="confirmSharedPassword" required type="password" />
            </label>
            <button className="button button-dark" disabled={busy} type="submit">{busy ? "Akoonka waa la samaynayaa..." : "Xubin ku dar"}</button>
          </form>
          <p className="form-hint">Akoonka si toos ah ayaa loo abuuraa, email xaqiijin ama martiqaadna lama diro. Xubnaha cusub waxay isticmaali doonaan password-ka ganacsiga; email-koodu ayaa kala gaar ah. Hubi in email-ka qofka sax yahay ka hor intaadan samayn, maadaama aan la xaqiijin doonin lahaanshihiisa.</p>
        </section>
      )}
      <section className="panel workspace-module-panel">
        <div className="section-heading"><div><span className="section-kicker">XUBNAHA FIRFIRCOON</span><h2>{initialMembers.filter((member) => member.status === "active").length} xubnood</h2></div></div>
        {initialMembers.length === 0 ? (
          <div className="admin-empty"><strong>Xubin kale lama darin.</strong><span>Martiqaad xubnaha ka tirsan ganacsigan halkan ayuu ka bilaabmaa.</span></div>
        ) : (
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead><tr><th>MAGACA</th><th>EMAIL</th><th>DOORKA</th><th>XAAALAD</th><th>LA KU DARAY</th>{canRemove && <th>FICIL</th>}</tr></thead>
              <tbody>
                {initialMembers.map((member) => (
                  <tr key={member.user_id}>
                    <td>{member.display_name || "Xubin"}</td>
                    <td>{member.email || member.user_id}</td>
                    <td>{member.role}</td>
                    <td>{member.status}</td>
                    <td>{formatMemberDate(member.created_at)}</td>
                    {canRemove && <td>{member.user_id !== currentUserId && member.role !== "owner" && member.status === "active" ? <button className="action-button action-danger" disabled={busy} onClick={() => removeMember(member)} type="button">Ka saar</button> : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

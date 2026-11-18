"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BusinessRegistrationPage() {
  const router = useRouter();
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [category, setCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryAddError, setCategoryAddError] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const response = await fetch("/api/business-categories", { cache: "no-store" });
        const result = await response.json() as { categories?: unknown; error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? "Business categories lama soo qaadi karin.");
        }
        if (
          !Array.isArray(result.categories)
          || !result.categories.every((item) => typeof item === "string")
        ) {
          throw new Error("Jawaabta business categories-ku sax ma aha.");
        }
        if (active) setBusinessCategories(result.categories);
      } catch (loadError) {
        if (active) {
          setCategoriesError(
            loadError instanceof Error
              ? loadError.message
              : "Business categories lama soo qaadi karin.",
          );
        }
      } finally {
        if (active) setCategoriesLoading(false);
      }
    }

    void loadCategories();
    return () => {
      active = false;
    };
  }, []);

  function addCategoryToApplication() {
    const name = newCategory.trim().replace(/\s+/g, " ");
    setCategoryAddError("");

    if (!name) {
      setCategoryAddError("Geli magaca category-ga.");
      return;
    }

    const existing = businessCategories.find(
      (item) => item.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setCategory(existing);
      setCategoryAddError("Category-gaas hore ayuu liiska ugu jiraa; waan kuu doortay.");
      return;
    }

    setBusinessCategories((current) => [...current, name]);
    setCategory(name);
    setNewCategory("");
    setShowAddCategory(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRegistered(false);
    try {
      if (!businessCategories.includes(category)) {
        setError("Dooro category firfircoon oo liiska ku jira.");
        return;
      }
      const supabase = createClient();
      const { data: registrationOpen, error: settingsError } = await supabase.rpc("is_business_registration_open");
      if (settingsError) {
        setError(`Diiwaangelinta lama xaqiijin: ${settingsError.message}`);
        return;
      }
      if (!registrationOpen) {
        setError("Diiwaangelinta ganacsiyada hadda way xiran tahay.");
        return;
      }
      const origin = window.location.origin;
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/app/register/complete&portal=business`,
          data: {
            full_name: ownerName.trim(),
            pending_business_name: businessName.trim(),
            pending_business_category: category,
            pending_business_phone: phone.trim(),
          },
        },
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }
      if (!data.user) {
        setError("Akoonka lama samayn. Fadlan mar kale isku day.");
        return;
      }
      if (data.user.identities?.length === 0) {
        setError("Email-kan hore ayaa loo isticmaalay. Haddii aad dhawaan isdiiwaangelisay, xaqiiji email-kaaga ka hor intaadan gelin.");
        return;
      }
      if (data.session) {
        router.replace("/app/register/complete");
        router.refresh();
      } else {
        setRegistered(true);
      }
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Diiwaangelintu ma suurtagelin.");
    } finally {
      setBusy(false);
    }
  }

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="auth-page registration-page">
      <Link className="brand auth-brand" href="/"><span className="brand-mark">V</span><span>VELTO</span></Link>
      <section className="auth-card registration-card">
        {registered ? (
          <>
            <div className="auth-icon" aria-hidden="true">◷</div>
            <div className="auth-kicker">BUSINESS APPLICATION</div>
            <h1>Sug inta lagu aqbalayo.</h1>
            <p className="auth-description">
              Xaqiiji email-kaaga adigoo furaya link-ga aan kuu dirnay. Markaas codsigaaga waxaa lagu dari doonaa
              Business applications si Super Admin uu u eego oo u ansixiyo.
            </p>
            <Link className="button button-dark auth-submit" href="/app/login">Ku noqo gelitaanka <span>→</span></Link>
          </>
        ) : (
          <>
            <div className="auth-icon" aria-hidden="true">⌂</div>
            <div className="auth-kicker">BUSINESS APPLICATION</div>
            <h1>Ganacsigaaga diiwaangeli.</h1>
            <p className="auth-description">Codsiga ganacsigaaga waxaa loo gudbinayaa Super Admin si loo eego loona ansixiyo.</p>
            <form className="auth-form" onSubmit={submit}>
              <label htmlFor="business-name">Magaca ganacsiga</label>
              <input id="business-name" onChange={(event) => setBusinessName(event.target.value)} required value={businessName} />
              <label htmlFor="owner-name">Magaca milkiilaha</label>
              <input id="owner-name" onChange={(event) => setOwnerName(event.target.value)} required value={ownerName} />
              <label htmlFor="business-category">Business category</label>
              <select id="business-category" onChange={(event) => setCategory(event.target.value)} required value={category}>
                <option disabled value="">
                  {categoriesLoading ? "Categories waa la soo rarayaa..." : "Dooro category"}
                </option>
                {businessCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
              <div className="registration-add-category-action">
                <button
                  aria-expanded={showAddCategory}
                  className="registration-add-category-button"
                  disabled={categoriesLoading}
                  onClick={() => {
                    setShowAddCategory((isOpen) => !isOpen);
                    setCategoryAddError("");
                  }}
                  type="button"
                >
                  {showAddCategory ? "Xir" : "+ Add Category"}
                </button>
              </div>
              {showAddCategory && (
                <div className="registration-add-category-panel">
                  <label htmlFor="new-business-category">Magaca category-ga cusub</label>
                  <div className="registration-add-category-controls">
                    <input
                      autoComplete="off"
                      id="new-business-category"
                      maxLength={80}
                      onChange={(event) => {
                        setNewCategory(event.target.value);
                        setCategoryAddError("");
                      }}
                      placeholder="Tusaale: Farmashiye"
                      value={newCategory}
                    />
                    <button
                      className="button button-dark"
                      disabled={!newCategory.trim()}
                      onClick={addCategoryToApplication}
                      type="button"
                    >
                      Ku dar
                    </button>
                  </div>
                  <p className="registration-add-category-hint">
                    Category-ga waxaa lagu dari doonaa codsigan oo keliya. Super Admin ayaa maamula liiska guud.
                  </p>
                  {categoryAddError && <p className="form-error" role="alert">{categoryAddError}</p>}
                </div>
              )}
              {categoriesError && (
                <p className="form-error" role="alert">
                  {categoriesError} Waxaad weli ku soo jeedin kartaa category adigoo riixaya “Add Category”.
                </p>
              )}
              {!categoriesLoading && !categoriesError && !businessCategories.length && (
                <p className="form-error" role="alert">
                  Category firfircoon wali ma jiro. Riix “Add Category” si aad ugu soo jeediso mid codsigan.
                </p>
              )}
              <label htmlFor="business-phone">Telefoonka ganacsiga</label>
              <input autoComplete="tel" id="business-phone" onChange={(event) => setPhone(event.target.value)} required type="tel" value={phone} />
              <label htmlFor="registration-email">Email</label>
              <input autoComplete="email" id="registration-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              <label htmlFor="registration-password">Password</label>
              <input autoComplete="new-password" id="registration-password" minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
              {error && <p className="form-error" role="alert">{error}</p>}
              {!configured && <p className="form-error" role="alert">Supabase lama dejin. Diiwaangelintu ma shaqayn karto ilaa environment variables-ka la dejiyo.</p>}
              <button className="button button-dark auth-submit" disabled={busy || !configured || categoriesLoading || !businessCategories.length} type="submit">{busy ? "Waa la diiwaangelinayaa..." : "Codsiga gudbi"} <span>→</span></button>
            </form>
            <Link className="auth-back" href="/app/login">Akoon hore ma leedahay? Gal</Link>
          </>
        )}
      </section>
    </main>
  );
}

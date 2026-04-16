import { useEffect, useMemo, useState } from "react";
import { invokeAdminApi } from "./adminApi";

const SIGNAL_TYPES = ["high_confidence", "clustered_activity", "unusual_buying", "insider_risk"];

function formatSignalType(value) {
  return value.replaceAll("_", " ");
}

function createDraft(subscription) {
  return {
    enabled: Boolean(subscription.enabled),
    minimum_confidence: subscription.minimum_confidence ?? 0.6,
    signal_types: Array.isArray(subscription.signal_types) ? [...subscription.signal_types] : [],
  };
}

function signalTypeSummary(signalTypes) {
  if (!signalTypes.length) {
    return "No signal types selected";
  }
  return signalTypes.map(formatSignalType).join(", ");
}

export default function SubscriptionManager({ refreshSignal = 0, onDataChange }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    enabled: true,
    minimum_confidence: "0.7",
    signal_types: ["high_confidence", "clustered_activity", "unusual_buying"],
  });

  const createFormReady = useMemo(() => Boolean(form.email.trim()), [form.email]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    invokeAdminApi("getSubscriptions", "Subscription API is not available yet")
      .then((data) => {
        if (!active) {
          return;
        }
        const list = Array.isArray(data) ? data : [];
        setSubscriptions(list);
        setDrafts(
          Object.fromEntries(
            list.map((subscription) => [subscription.id, createDraft(subscription)]),
          ),
        );
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError?.message || "Unable to load subscriptions");
          setSubscriptions([]);
          setDrafts({});
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshSignal]);

  const setDraftValue = (subscriptionId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [subscriptionId]: {
        ...(current[subscriptionId] || {}),
        [field]: value,
      },
    }));
  };

  const toggleSignalType = (target, value) => {
    if (target.includes(value)) {
      return target.filter((item) => item !== value);
    }
    return [...target, value];
  };

  const handleCreate = async () => {
    setCreateLoading(true);
    setCreateError("");
    try {
      await invokeAdminApi("createSubscription", "Create subscription API is not available yet", {
        email: form.email.trim(),
        enabled: form.enabled,
        minimum_confidence: Number(form.minimum_confidence),
        signal_types: form.signal_types,
      });
      setForm({
        email: "",
        enabled: true,
        minimum_confidence: "0.7",
        signal_types: ["high_confidence", "clustered_activity", "unusual_buying"],
      });
      onDataChange?.();
    } catch (createFailure) {
      setCreateError(createFailure?.message || "Unable to create subscription");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSave = async (subscriptionId) => {
    const draft = drafts[subscriptionId];
    if (!draft) {
      return;
    }

    setSavingId(subscriptionId);
    setError("");
    try {
      await invokeAdminApi("updateSubscription", "Update subscription API is not available yet", subscriptionId, {
        enabled: draft.enabled,
        minimum_confidence: Number(draft.minimum_confidence),
        signal_types: draft.signal_types,
      });
      onDataChange?.();
    } catch (saveFailure) {
      setError(saveFailure?.message || "Unable to save subscription");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (subscriptionId) => {
    if (!window.confirm("Delete this alert subscription?")) {
      return;
    }

    setDeletingId(subscriptionId);
    setError("");
    try {
      await invokeAdminApi("deleteSubscription", "Delete subscription API is not available yet", subscriptionId);
      onDataChange?.();
    } catch (deleteFailure) {
      setError(deleteFailure?.message || "Unable to delete subscription");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="card controls">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">Subscriptions</p>
          <h2>Alert subscription manager</h2>
        </div>
        <span className="pill">{loading ? "Loading" : `${subscriptions.length} subscriptions`}</span>
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: "18px", padding: "1rem", background: "rgba(255,255,255,0.72)" }}>
        <p className="eyebrow">Create subscription</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
          <label>
            Email
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="alerts@example.com" />
          </label>
          <label>
            Minimum confidence
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.minimum_confidence}
              onChange={(event) => setForm((current) => ({ ...current, minimum_confidence: event.target.value }))}
            />
          </label>
        </div>
        <label style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span>Enabled</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
            style={{ width: "auto", marginTop: 0 }}
          />
        </label>
        <div style={{ marginTop: "0.75rem" }}>
          <p className="muted" style={{ marginBottom: "0.4rem" }}>
            Signal types
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {SIGNAL_TYPES.map((signalType) => {
              const checked = form.signal_types.includes(signalType);
              return (
                <label
                  key={signalType}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.45rem 0.65rem",
                    borderRadius: "999px",
                    border: "1px solid var(--line)",
                    background: checked ? "#fff4ea" : "rgba(255,255,255,0.8)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    style={{ width: "auto", marginTop: 0 }}
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        signal_types: toggleSignalType(current.signal_types, signalType),
                      }))
                    }
                  />
                  {formatSignalType(signalType)}
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.9rem" }}>
          <button type="button" onClick={handleCreate} disabled={createLoading || !createFormReady}>
            {createLoading ? "Creating..." : "Create subscription"}
          </button>
          <span className="muted">Edit the list below after creation.</span>
        </div>
        {createError ? <p className="signal-error">{createError}</p> : null}
      </div>

      {error ? <p className="signal-error">{error}</p> : null}

      <div style={{ display: "grid", gap: "0.85rem" }}>
        {!loading && subscriptions.length === 0 ? <p className="muted">No alert subscriptions have been created yet.</p> : null}

        {subscriptions.map((subscription) => {
          const draft = drafts[subscription.id] || createDraft(subscription);
          return (
            <article
              key={subscription.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "18px",
                padding: "1rem",
                background: "rgba(255, 255, 255, 0.72)",
              }}
            >
              <div className="signal-results-header">
                <div>
                  <strong>{subscription.email}</strong>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {signalTypeSummary(subscription.signal_types || [])}
                  </p>
                </div>
                <span className="pill">{subscription.enabled ? "Enabled" : "Disabled"}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem", marginTop: "0.85rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                  Enabled
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraftValue(subscription.id, "enabled", event.target.checked)}
                    style={{ width: "auto", marginTop: 0 }}
                  />
                </label>
                <label>
                  Minimum confidence
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={draft.minimum_confidence}
                    onChange={(event) => setDraftValue(subscription.id, "minimum_confidence", event.target.value)}
                  />
                </label>
              </div>

              <div style={{ marginTop: "0.85rem" }}>
                <p className="muted" style={{ marginBottom: "0.4rem" }}>
                  Signal types
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {SIGNAL_TYPES.map((signalType) => {
                    const checked = draft.signal_types.includes(signalType);
                    return (
                      <label
                        key={signalType}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "999px",
                          border: "1px solid var(--line)",
                          background: checked ? "#fff4ea" : "rgba(255,255,255,0.8)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          style={{ width: "auto", marginTop: 0 }}
                          onChange={() =>
                            setDrafts((current) => ({
                              ...current,
                              [subscription.id]: {
                                ...draft,
                                signal_types: toggleSignalType(draft.signal_types, signalType),
                              },
                            }))
                          }
                        />
                        {formatSignalType(signalType)}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.95rem" }}>
                <button type="button" onClick={() => handleSave(subscription.id)} disabled={savingId === subscription.id || deletingId === subscription.id}>
                  {savingId === subscription.id ? "Saving..." : "Save changes"}
                </button>
                <button type="button" onClick={() => handleDelete(subscription.id)} disabled={deletingId === subscription.id || savingId === subscription.id}>
                  {deletingId === subscription.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

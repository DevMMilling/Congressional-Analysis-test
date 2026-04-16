import { useState } from "react";
import { api } from "../api";

export default function AdminPage() {
  const [jobResponse, setJobResponse] = useState(null);
  const [form, setForm] = useState({ email: "", minimum_confidence: 0.7 });

  const submitSubscription = async () => {
    const response = await api.createSubscription({
      email: form.email,
      enabled: true,
      minimum_confidence: Number(form.minimum_confidence),
      signal_types: ["high_confidence", "clustered_activity", "unusual_buying"],
    });
    setJobResponse({ message: `Subscription created for ${response.email}` });
  };

  return (
    <div className="page-grid">
      <section className="card controls">
        <p className="eyebrow">Data operations</p>
        <h2>Refresh and retrain</h2>
        <button onClick={() => api.postBackfill().then(setJobResponse)}>Run historical backfill</button>
        <button onClick={() => api.postUpdate().then(setJobResponse)}>Run incremental update</button>
        <button onClick={() => api.postRetrain().then(setJobResponse)}>Retrain models</button>
        {jobResponse ? <pre>{JSON.stringify(jobResponse, null, 2)}</pre> : null}
      </section>
      <section className="card controls">
        <p className="eyebrow">Alerts</p>
        <h2>Email subscription</h2>
        <label>
          Email
          <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label>
          Minimum confidence
          <input
            type="number"
            step="0.01"
            value={form.minimum_confidence}
            onChange={(event) => setForm((current) => ({ ...current, minimum_confidence: event.target.value }))}
          />
        </label>
        <button onClick={submitSubscription}>Create alert subscription</button>
      </section>
    </div>
  );
}

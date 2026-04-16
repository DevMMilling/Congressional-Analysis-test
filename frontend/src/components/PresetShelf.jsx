import { useState } from "react";

export default function PresetShelf({
  title,
  eyebrow = "Saved presets",
  presets,
  activePresetId,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onClearPresets,
}) {
  const [presetName, setPresetName] = useState("");

  const savePreset = () => {
    const trimmed = presetName.trim();
    if (!trimmed) {
      return;
    }
    onSavePreset(trimmed);
    setPresetName("");
  };

  return (
    <section className="card">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="pill">{presets.length} saved</span>
      </div>

      <div className="controls" style={{ gridTemplateColumns: "1fr auto auto" }}>
        <label>
          Preset name
          <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="My filtered view" />
        </label>
        <button type="button" onClick={savePreset}>
          Save current
        </button>
        <button type="button" onClick={onClearPresets} disabled={!presets.length}>
          Clear all
        </button>
      </div>

      {presets.length ? (
        <div className="pill-row" style={{ marginTop: "1rem" }}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="pill"
              onClick={() => onApplyPreset(preset)}
              style={{
                cursor: "pointer",
                background: activePresetId === preset.id ? "var(--accent-2)" : "#fff4ea",
                color: activePresetId === preset.id ? "white" : "#9a3412",
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: "1rem" }}>
          Save a few combinations here to jump between filtered views quickly.
        </p>
      )}

      {activePresetId ? (
        <div className="signal-toolbar" style={{ marginTop: "1rem" }}>
          <span className="muted">Active preset ready</span>
          <button type="button" onClick={() => onDeletePreset(activePresetId)}>
            Delete active preset
          </button>
        </div>
      ) : null}
    </section>
  );
}

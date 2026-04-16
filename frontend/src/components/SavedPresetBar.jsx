import { useState } from "react";

export default function SavedPresetBar({
  presets,
  activePresetId,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onClearPresets,
}) {
  const [presetName, setPresetName] = useState("");

  const savePreset = () => {
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      return;
    }

    onSavePreset(trimmedName);
    setPresetName("");
  };

  return (
    <section className="card">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">Saved presets</p>
          <h3>Backtest views</h3>
        </div>
        <span className="pill">{presets.length} saved</span>
      </div>

      <div className="controls" style={{ gridTemplateColumns: "1fr auto auto" }}>
        <label>
          Preset name
          <input
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="Bullish buy screen"
          />
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
              className={`pill ${activePresetId === preset.id ? "active" : ""}`}
              onClick={() => onApplyPreset(preset)}
              style={{ cursor: "pointer" }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: "1rem" }}>
          Save a few filter combinations here to jump between backtest setups quickly.
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

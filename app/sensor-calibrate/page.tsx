"use client";
import { useState } from "react";

export default function SensorCalibratePage() {
  const [dark, setDark] = useState("3500");
  const [bright, setBright] = useState("700");
  const [raw, setRaw] = useState("2100");

  const darkNum = Number(dark);
  const brightNum = Number(bright);
  const rawNum = Number(raw);
  const valid = Number.isInteger(darkNum) && Number.isInteger(brightNum) && darkNum >= 0 && darkNum <= 4095 && brightNum >= 0 && brightNum <= 4095 && darkNum !== brightNum;
  const invert = valid && brightNum > darkNum;
  const pct = valid ? (invert ? (rawNum - darkNum) * 100 / (brightNum - darkNum) : (darkNum - rawNum) * 100 / (darkNum - brightNum)) : 0;
  const normalized = valid ? `${Math.max(0, Math.min(100, Math.round(pct)))}%` : "—";
  const mappingText = valid ? `Bright ADC is ${brightNum > darkNum ? "higher" : "lower"} than dark ADC; ${invert ? "enable" : "disable"} inversion.` : "Enter two different ADC readings from 0 to 4095.";
  const constantsText = valid ? `constexpr int LDR_DARK_ADC = ${darkNum};\nconstexpr int LDR_BRIGHT_ADC = ${brightNum};\nconstexpr bool INVERT_ADC = ${invert ? "true" : "false"};` : "// Calibration values are not valid yet.";

  return (
    <div className="calibrate-page">
      <main>
        <h1>FixFlow LDR calibration</h1>
        <p>Enter representative raw ADC readings captured from the ESP32 in the demo room. This helper generates firmware constants and previews the normalized 0–100% mapping; it does not connect to the board.</p>
        <div className="grid">
          <div>
            <label htmlFor="dark">Dark-room ADC reading</label>
            <input id="dark" type="number" min={0} max={4095} value={dark} onChange={(e) => setDark(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bright">Bright-room ADC reading</label>
            <input id="bright" type="number" min={0} max={4095} value={bright} onChange={(e) => setBright(e.target.value)} />
          </div>
        </div>
        <div className="result" aria-live="polite">
          <div>{mappingText}</div>
          <label htmlFor="raw">Try a raw ADC value: <output>{rawNum}</output></label>
          <input id="raw" type="range" min={0} max={4095} value={raw} onChange={(e) => setRaw(e.target.value)} />
          <p>Normalized brightness: <strong>{normalized}</strong></p>
        </div>
        <h2>Firmware settings</h2>
        <pre>{constantsText}</pre>
        <p>Verify the readings with the actual divider and room lighting. These percentages are calibrated demo values, not lux measurements.</p>
      </main>
      <style>{`
        .calibrate-page :root{font:16px/1.5 system-ui,sans-serif;color:#172033;background:#f4f7fb}
        .calibrate-page body{max-width:720px;margin:7vh auto;padding:24px}
        .calibrate-page main{background:#fff;border:1px solid #dce3ed;border-radius:16px;padding:28px;box-shadow:0 8px 28px #17203310}
        .calibrate-page h1{margin:0;font-size:1.5rem;color:#172033}.calibrate-page h2{font-size:1.2rem;margin:20px 0 8px}
        .calibrate-page p{color:#526078}
        .calibrate-page label{display:block;margin:18px 0 6px;font-weight:600}
        .calibrate-page input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bbc6d5;border-radius:7px;font:inherit}
        .calibrate-page input[type=range]{padding:0;border:none}
        .calibrate-page .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .calibrate-page .result{margin-top:20px;padding:16px;border-radius:9px;background:#eff6ff}
        .calibrate-page pre{overflow:auto;padding:14px;border-radius:8px;background:#101827;color:#e6edf7;font-family:ui-monospace,monospace;white-space:pre-wrap}
        @media(max-width:560px){.calibrate-page .grid{grid-template-columns:1fr;gap:0}}
      `}</style>
    </div>
  );
}

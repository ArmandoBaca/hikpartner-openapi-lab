"use client";

import { useState } from "react";
import { ModulePage } from "@/components/ModulePage";
import { hppUpload } from "@/lib/client";

function AudioUpload() {
  const [fileName, setFileName] = useState("aviso");
  const [formatType, setFormatType] = useState("mp3");
  const [file, setFile] = useState<File | null>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("path", "/api/hpcgw/v1/audio/file/upload");
    form.set("fileName", fileName);
    form.set("formatType", formatType);
    form.set("audioFile", file);
    const res = await hppUpload(form);
    setOut(JSON.stringify(res, null, 2));
    setBusy(false);
  }

  return (
    <section className="neu" style={{ marginBottom: 18 }}>
      <h3>Subir archivo de audio</h3>
      <p className="desc">multipart → POST /api/hpcgw/v1/audio/file/upload. MP3/WAV/AAC ≤ 10 MB. Luego aplica con audio/file/add.</p>
      <label className="label">
        fileName
        <input className="field" value={fileName} onChange={(e) => setFileName(e.target.value)} />
      </label>
      <label className="label">
        formatType
        <input className="field" value={formatType} onChange={(e) => setFormatType(e.target.value)} />
      </label>
      <label className="label">
        audioFile
        <input className="field" type="file" accept=".mp3,.wav,.aac,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !file} onClick={() => void upload()}>
          {busy ? "Subiendo…" : "Upload"}
        </button>
      </div>
      {out && <pre className="result">{out}</pre>}
    </section>
  );
}

export default function Page() {
  return <ModulePage slug="audio" extra={<AudioUpload />} />;
}

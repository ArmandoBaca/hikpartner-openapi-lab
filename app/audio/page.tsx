"use client";

import { useEffect, useState } from "react";
import { OpsGrid } from "@/components/OperationCard";
import { hppCall, hppUpload } from "@/lib/client";
import { moduleBySlug } from "@/lib/operations";

type UploadedAudio = {
  audioFileUrl: string;
  uuid: string;
  name: string;
  format: string;
};

type DeviceAudio = {
  customAudioID: number;
  customAudioName?: string;
  audioFileFormat?: string;
  audioFileSize?: number;
  audioFileDuration?: number;
  customAudioFile?: { filePathType?: string; filePath?: string };
};

export default function AudioPage() {
  const [fileName, setFileName] = useState("aviso");
  const [formatType, setFormatType] = useState("mp3");
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [uploaded, setUploaded] = useState<UploadedAudio | null>(null);
  const [serial, setSerial] = useState("");
  const [audios, setAudios] = useState<DeviceAudio[]>([]);
  const [tts, setTts] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const audioModule = moduleBySlug("audio");

  useEffect(() => {
    if (!file) {
      setLocalUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("Subiendo archivo a Hik-Partner Pro…");
    const form = new FormData();
    form.set("path", "/api/hpcgw/v1/audio/file/upload");
    form.set("fileName", fileName);
    form.set("formatType", formatType);
    form.set("audioFile", file);
    try {
      const response = await hppUpload(form);
      const result = response.result as {
        errorCode?: string;
        message?: string;
        data?: { audioFileUrl?: string; uuid?: string };
      };
      if (result?.errorCode === "0" && result.data?.audioFileUrl && result.data.uuid) {
        setUploaded({
          audioFileUrl: result.data.audioFileUrl,
          uuid: result.data.uuid,
          name: fileName,
          format: formatType,
        });
        setMessage("Archivo subido. Ahora aplícalo al altavoz para obtener un customAudioID.");
      } else {
        setMessage(`No se pudo subir: ${result?.message ?? result?.errorCode ?? "respuesta inesperada"}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyToDevice() {
    if (!uploaded || !serial) return;
    setBusy(true);
    setMessage("Registrando el audio en el altavoz…");
    try {
      const response = await hppCall({
        path: "/api/hpcgw/v1/audio/file/add",
        body: {
          deviceSerial: serial,
          customAudioInfo: {
            customAudioName: uploaded.name,
            customAudioURL: uploaded.audioFileUrl,
            audioFileFormat: uploaded.format,
            uuid: uploaded.uuid,
          },
        },
      });
      const result = response.result as { errorCode?: string; message?: string };
      setMessage(
        result?.errorCode === "0"
          ? "Audio aplicado al altavoz. Actualiza la biblioteca para reproducirlo."
          : `No se pudo aplicar: ${result?.message ?? result?.errorCode ?? "error"}`,
      );
      if (result?.errorCode === "0") await loadLibrary();
    } finally {
      setBusy(false);
    }
  }

  async function loadLibrary() {
    if (!serial) return;
    setBusy(true);
    setMessage("Consultando la biblioteca del altavoz…");
    try {
      const response = await hppCall({
        path: "/api/hpcgw/v1/audio/file/list/get",
        body: { deviceSerial: serial },
      });
      const result = response.result as {
        errorCode?: string;
        message?: string;
        data?: { CustomAudioInfoList?: DeviceAudio[] };
      };
      if (result?.errorCode === "0") {
        const list = result.data?.CustomAudioInfoList ?? [];
        setAudios(list);
        setMessage(`${list.length} audio(s) configurado(s) en el dispositivo.`);
      } else {
        setMessage(`No se pudo consultar: ${result?.message ?? result?.errorCode ?? "error"}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cutIn(playAudioList: object[], successMessage: string) {
    setBusy(true);
    setMessage("Enviando orden de reproducción al altavoz…");
    try {
      const response = await hppCall({
        path: "/api/hpcgw/v1/audio/inter/cut",
        body: {
          deviceSerial: serial,
          audioLevel: 10,
          enabled: true,
          playMode: "order",
          audioVolume: 80,
          TTSLanguageType: "spanish",
          voiceType: "female",
          pace: 50,
          playAudioList,
        },
      });
      const result = response.result as { errorCode?: string; message?: string };
      setMessage(
        result?.errorCode === "0"
          ? successMessage
          : `No se pudo reproducir: ${result?.message ?? result?.errorCode ?? "error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <span className="eyebrow">IP Speaker · categoría 12 / subtipo 19</span>
        <h2>Centro de audio</h2>
        <p>Sube, administra y emite avisos por los altavoces de la instalación.</p>
      </header>

      <div className="note audio-explanation">
        <strong>Hay dos reproducciones diferentes:</strong> “Vista previa” suena en este navegador
        antes de subir. “Reproducir en altavoz” envía una orden <code>audio/inter/cut</code> y el
        sonido sale físicamente del IP Speaker seleccionado.
      </div>

      <section className="audio-workflow">
        <article className="neu audio-step">
          <span className="step-number">1</span>
          <h3>Seleccionar y revisar</h3>
          <p className="desc">MP3, WAV o AAC; máximo 10 MB. El nombre debe ser único.</p>
          <label className="label">
            Archivo
            <input
              className="field"
              type="file"
              accept=".mp3,.wav,.aac,audio/*"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) {
                  setFileName(selected.name.replace(/\.[^.]+$/, ""));
                  setFormatType(selected.name.split(".").pop()?.toLowerCase() ?? "mp3");
                }
              }}
            />
          </label>
          <label className="label">
            Nombre en HPP
            <input className="field" value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </label>
          {localUrl && (
            <div className="browser-preview">
              <span>Vista previa en este navegador</span>
              <audio controls src={localUrl} />
            </div>
          )}
          <button className="btn primary" disabled={busy || !file} onClick={() => void upload()}>
            {busy ? "Procesando…" : "Subir a HPP"}
          </button>
        </article>

        <article className="neu audio-step">
          <span className="step-number">2</span>
          <h3>Aplicar al altavoz</h3>
          <p className="desc">El upload por sí solo no aparece en el equipo. Debes aplicarlo a un serial compatible.</p>
          <label className="label">
            Serial del IP Speaker
            <input className="field" value={serial} onChange={(event) => setSerial(event.target.value.trim())} />
          </label>
          {uploaded ? (
            <div className="uploaded-audio">
              <strong>{uploaded.name}.{uploaded.format}</strong>
              <small>UUID: {uploaded.uuid}</small>
            </div>
          ) : (
            <div className="empty-state compact">Primero sube un archivo.</div>
          )}
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !uploaded || !serial} onClick={() => void applyToDevice()}>
              Aplicar al dispositivo
            </button>
            <button className="btn" disabled={busy || !serial} onClick={() => void loadLibrary()}>
              Actualizar biblioteca
            </button>
          </div>
        </article>
      </section>

      {message && <div className="dashboard-status audio-status">{message}</div>}

      <div className="audio-layout">
        <section className="neu">
          <div className="section-title">
            <div>
              <h3>Biblioteca del altavoz</h3>
              <p className="desc">Audios aplicados al serial {serial || "—"}.</p>
            </div>
            <button className="btn" disabled={busy || !serial} onClick={() => void loadLibrary()}>Actualizar</button>
          </div>
          <div className="audio-library">
            {!audios.length && (
              <div className="empty-state">
                <strong>Sin audios cargados</strong>
                <span>Escribe el serial y actualiza la biblioteca.</span>
              </div>
            )}
            {audios.map((audio) => {
              const previewUrl = audio.customAudioFile?.filePathType === "URL"
                ? audio.customAudioFile.filePath
                : undefined;
              return (
                <article className="audio-item" key={audio.customAudioID}>
                  <div>
                    <strong>{audio.customAudioName ?? `Audio ${audio.customAudioID}`}</strong>
                    <small>
                      ID {audio.customAudioID} · {audio.audioFileFormat ?? "—"} ·{" "}
                      {audio.audioFileDuration ? `${audio.audioFileDuration}s` : "duración n/d"}
                    </small>
                  </div>
                  {previewUrl && <audio controls preload="none" src={previewUrl} />}
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void cutIn(
                      [{ audioSource: "customAudio", customAudioID: audio.customAudioID }],
                      "Orden aceptada. El audio debe escucharse en el altavoz IP, no en este navegador.",
                    )}
                  >
                    Reproducir en altavoz
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="neu tts-panel">
          <span className="step-number">TTS</span>
          <h3>Texto a voz</h3>
          <p className="desc">No requiere subir un archivo. El altavoz sintetiza el texto en español.</p>
          <label className="label">
            Mensaje
            <textarea
              className="field"
              maxLength={4096}
              placeholder="Atención: esta es una prueba del sistema de audio."
              value={tts}
              onChange={(event) => setTts(event.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={busy || !serial || !tts.trim()}
            onClick={() => void cutIn(
              [{ audioSource: "speechSynthesis", speechSynthesisContent: tts.trim() }],
              "TTS aceptado. La voz debe salir del altavoz IP.",
            )}
          >
            Emitir en el altavoz
          </button>
          {!serial && <p className="desc">Escribe el serial en el paso 2.</p>}
        </section>
      </div>

      <details className="advanced-tools">
        <summary>Herramientas API avanzadas</summary>
        <p className="desc">Formularios directos para borrado y payloads personalizados.</p>
        {audioModule && <OpsGrid ops={audioModule.ops} />}
      </details>
    </>
  );
}

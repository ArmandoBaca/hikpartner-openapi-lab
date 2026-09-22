"use client";

import { useEffect, useState } from "react";
import { DevicePicker } from "@/components/DevicePicker";
import { OpsGrid } from "@/components/OperationCard";
import { hppCall, hppUpload, type HppCallResponse } from "@/lib/client";
import { categoryLabel, isSpeaker, useDevices } from "@/lib/devices";
import { explainError } from "@/lib/errors";
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

type CallOutcome = { serial: string; ok: boolean; detail: string };

type Trace = {
  at: string;
  label: string;
  path: string;
  request: unknown;
  response: unknown;
};

function errorCodeOf(response: HppCallResponse) {
  const result = response.result as { errorCode?: string } | undefined;
  return result?.errorCode ?? response.errorCode;
}

/** Mensaje de error: código de HPP, su traducción y el texto original. */
function errorText(response: HppCallResponse) {
  const result = response.result as { errorCode?: string; message?: string } | undefined;
  const code = errorCodeOf(response);
  const explanation = explainError(code, "audio");
  const raw = result?.message ?? response.message;
  return [code, explanation || raw].filter(Boolean).join(" · ") || `HTTP ${response.httpStatus ?? "?"}`;
}

function summarize(outcomes: CallOutcome[], action: string) {
  const failed = outcomes.filter((item) => !item.ok);
  if (!failed.length) {
    return `${action} en ${outcomes.length} altavoz(ces): ${outcomes.map((item) => item.serial).join(", ")}.`;
  }
  const ok = outcomes.length - failed.length;
  return `${action} en ${ok} de ${outcomes.length}. Fallos: ${failed
    .map((item) => `${item.serial} (${item.detail})`)
    .join(", ")}.`;
}

export default function AudioPage() {
  const [fileName, setFileName] = useState("aviso");
  const [formatType, setFormatType] = useState("mp3");
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [uploaded, setUploaded] = useState<UploadedAudio | null>(null);
  const [serials, setSerials] = useState<string[]>([]);
  const [libraryTarget, setLibraryTarget] = useState("");
  const [audios, setAudios] = useState<DeviceAudio[]>([]);
  const [tts, setTts] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<Trace[]>([]);
  const { devices } = useDevices();
  const audioModule = moduleBySlug("audio");

  const notSpeakers = serials
    .map((serial) => devices.find((device) => device.deviceSerial === serial))
    .filter((device) => device && !isSpeaker(device));

  async function tracked(label: string, path: string, body: unknown) {
    const response = await hppCall({ path, body });
    setTrace((prev) => [
      { at: new Date().toLocaleTimeString(), label, path, request: body, response },
      ...prev,
    ].slice(0, 6));
    return response;
  }

  async function runOnDevices(
    label: string,
    path: string,
    targets: string[],
    buildBody: (serial: string) => unknown,
  ): Promise<CallOutcome[]> {
    const outcomes: CallOutcome[] = [];
    for (const serial of targets) {
      const response = await tracked(`${label} · ${serial}`, path, buildBody(serial));
      const result = response.result as { errorCode?: string } | undefined;
      outcomes.push({
        serial,
        ok: result?.errorCode === "0",
        detail: errorText(response),
      });
    }
    return outcomes;
  }

  useEffect(() => {
    if (!file) {
      setLocalUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!serials.includes(libraryTarget)) {
      setLibraryTarget(serials[0] ?? "");
      setAudios([]);
    }
  }, [serials, libraryTarget]);

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
      setTrace((prev) => [
        {
          at: new Date().toLocaleTimeString(),
          label: "audio/file/upload",
          path: "/api/hpcgw/v1/audio/file/upload",
          request: { fileName, formatType, audioFile: file.name },
          response,
        },
        ...prev,
      ].slice(0, 6));
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
        setMessage("Archivo subido. Ahora aplícalo a los altavoces seleccionados.");
      } else {
        setMessage(`No se pudo subir: ${errorText(response)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyToDevices() {
    if (!uploaded || !serials.length) return;
    setBusy(true);
    setMessage("Registrando el audio en los altavoces…");
    try {
      const outcomes = await runOnDevices("audio/file/add", "/api/hpcgw/v1/audio/file/add", serials, (serial) => ({
        deviceSerial: serial,
        customAudioInfo: {
          customAudioName: uploaded.name,
          customAudioURL: uploaded.audioFileUrl,
          audioFileFormat: uploaded.format,
          uuid: uploaded.uuid,
        },
      }));
      setMessage(summarize(outcomes, "Audio aplicado"));
      if (outcomes.some((item) => item.ok)) {
        await loadLibrary(libraryTarget || serials[0]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadLibrary(target = libraryTarget) {
    if (!target) return;
    setBusy(true);
    setMessage(`Consultando la biblioteca de ${target}…`);
    try {
      const response = await tracked(
        "audio/file/list/get",
        "/api/hpcgw/v1/audio/file/list/get",
        { deviceSerial: target },
      );
      const result = response.result as {
        errorCode?: string;
        data?: Record<string, unknown>;
      } | undefined;
      if (result?.errorCode === "0") {
        // Algunos firmwares devuelven la lista con otra capitalización.
        const data = result.data ?? {};
        const list = (data.CustomAudioInfoList ??
          data.customAudioInfoList ??
          data.customAudioList ??
          []) as DeviceAudio[];
        setAudios(list);
        setMessage(
          list.length
            ? `${list.length} audio(s) configurado(s) en ${target}.`
            : `${target} respondió sin audios. Aplica un archivo o revisa el diagnóstico.`,
        );
      } else {
        setAudios([]);
        setMessage(`No se pudo consultar ${target}: ${errorText(response)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cutIn(targets: string[], playAudioList: object[], action: string) {
    if (!targets.length) return;
    setBusy(true);
    setMessage("Enviando orden de reproducción…");
    try {
      const outcomes = await runOnDevices("audio/inter/cut", "/api/hpcgw/v1/audio/inter/cut", targets, (serial) => ({
        deviceSerial: serial,
        audioLevel: 10,
        enabled: true,
        playMode: "order",
        audioVolume: 80,
        TTSLanguageType: "spanish",
        voiceType: "female",
        pace: 50,
        playAudioList,
      }));
      setMessage(`${summarize(outcomes, action)} El sonido sale del altavoz, no del navegador.`);
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
        sonido sale físicamente de los IP Speaker seleccionados.
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
          <h3>Elegir altavoces</h3>
          <p className="desc">
            Marca uno o varios equipos del inventario. Puedes aplicar y emitir en todos a la vez.
          </p>
          <DevicePicker
            selected={serials}
            onChange={setSerials}
            compatibleOnly
            compatibleLabel="Solo IP Speaker (12 / 19)"
            isCompatible={isSpeaker}
            hint="Desmarca el filtro si tu altavoz reporta otra categoría."
          />
          {uploaded ? (
            <div className="uploaded-audio">
              <strong>{uploaded.name}.{uploaded.format}</strong>
              <small>UUID: {uploaded.uuid}</small>
            </div>
          ) : (
            <div className="empty-state compact">Sube un archivo para poder aplicarlo.</div>
          )}
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy || !uploaded || !serials.length}
              onClick={() => void applyToDevices()}
            >
              Aplicar a {serials.length || 0} altavoz(ces)
            </button>
            <button className="btn" disabled={busy || !libraryTarget} onClick={() => void loadLibrary()}>
              Ver biblioteca
            </button>
          </div>
        </article>
      </section>

      {notSpeakers.length > 0 && (
        <div className="note audio-warning">
          <strong>Estos equipos no son IP Speaker:</strong>{" "}
          {notSpeakers.map((device) => `${device?.deviceSerial} (${categoryLabel(device!)})`).join(", ")}.
          Las APIs de audio solo funcionan en categoría 12 / subtipo 19, así que devolverán
          EVZ20015 o EVZ60020.
        </div>
      )}

      {message && <div className="dashboard-status audio-status">{message}</div>}

      <div className="audio-layout">
        <section className="neu">
          <div className="section-title">
            <div>
              <h3>Biblioteca del altavoz</h3>
              <p className="desc">Cada equipo tiene sus propios IDs de audio.</p>
            </div>
            <div className="library-target">
              <select
                className="field"
                value={libraryTarget}
                disabled={!serials.length}
                onChange={(event) => {
                  setLibraryTarget(event.target.value);
                  void loadLibrary(event.target.value);
                }}
              >
                {!serials.length && <option value="">Sin altavoces</option>}
                {serials.map((serial) => (
                  <option key={serial} value={serial}>{serial}</option>
                ))}
              </select>
              <button className="btn" disabled={busy || !libraryTarget} onClick={() => void loadLibrary()}>
                Actualizar
              </button>
            </div>
          </div>
          <div className="audio-library">
            {!audios.length && (
              <div className="empty-state">
                <strong>Sin audios cargados</strong>
                <span>Selecciona un altavoz y pulsa Actualizar.</span>
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
                    disabled={busy || !libraryTarget}
                    onClick={() => void cutIn(
                      [libraryTarget],
                      [{ audioSource: "customAudio", customAudioID: audio.customAudioID }],
                      "Reproducción aceptada",
                    )}
                  >
                    Reproducir en {libraryTarget || "altavoz"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="neu tts-panel">
          <span className="step-number">TTS</span>
          <h3>Texto a voz</h3>
          <p className="desc">
            No requiere archivos ni IDs, así que puede emitirse en todos los altavoces seleccionados.
          </p>
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
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy || !serials.length || !tts.trim()}
              onClick={() => void cutIn(
                serials,
                [{ audioSource: "speechSynthesis", speechSynthesisContent: tts.trim() }],
                "TTS aceptado",
              )}
            >
              Emitir en {serials.length || 0} altavoz(ces)
            </button>
            {libraryTarget && serials.length > 1 && (
              <button
                className="btn"
                disabled={busy || !tts.trim()}
                onClick={() => void cutIn(
                  [libraryTarget],
                  [{ audioSource: "speechSynthesis", speechSynthesisContent: tts.trim() }],
                  "TTS aceptado",
                )}
              >
                Solo {libraryTarget}
              </button>
            )}
          </div>
          {!serials.length && <p className="desc">Selecciona altavoces en el paso 2.</p>}
        </section>
      </div>

      <details className="advanced-tools" open={trace.length > 0}>
        <summary>Diagnóstico de las últimas llamadas ({trace.length})</summary>
        <p className="desc">
          Petición y respuesta exactas de cada paso. Si la reproducción no suena, aquí verás el
          errorCode que devolvió el altavoz.
        </p>
        {!trace.length && <div className="empty-state compact">Aún no hay llamadas en esta sesión.</div>}
        {trace.map((entry, index) => (
          <article className="trace-entry" key={`${entry.at}-${index}`}>
            <header>
              <strong>{entry.label}</strong>
              <small>{entry.at} · {entry.path}</small>
            </header>
            <pre className="result">{JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}</pre>
          </article>
        ))}
      </details>

      <details className="advanced-tools">
        <summary>Herramientas API avanzadas</summary>
        <p className="desc">Formularios directos para borrado y payloads personalizados.</p>
        {audioModule && <OpsGrid ops={audioModule.ops} />}
      </details>
    </>
  );
}

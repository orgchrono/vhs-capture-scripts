#!/usr/bin/env python3
"""
00_trim_black_sync.py
=====================
Remove frames pretos do VIDEO mantendo o ÁUDIO 100% contínuo e intacto.

PROBLEMA QUE ESTE SCRIPT RESOLVE:
  O dispositivo de captura insere frames pretos extras no stream de vídeo
  quando perde o sinal VHS (dropout, falha de tracking, cabeçote). Durante
  esses frames pretos, o áudio VHS continua sendo capturado normalmente —
  afinal, o áudio está gravado na fita e não para.

  Resultado: a cada gap de preto, o vídeo fica N frames "mais longo" que o
  áudio. Ao longo de uma fita de 90 minutos com múltiplos dropouts, o vídeo
  acumula vários segundos de atraso em relação ao áudio.

ESTRATÉGIA CORRETA (video-only removal):
  1. Detectar intervalos de frames pretos no vídeo (blackdetect).
  2. Remover esses frames do STREAM DE VÍDEO via select filter.
  3. Manter o ÁUDIO INTACTO e contínuo — não tocar nele.
  4. Reescrever os timestamps do vídeo (setpts) para que o primeiro frame
     depois do gap seja apresentado imediatamente após o frame anterior,
     sem pular o áudio correspondente.

  Isso é diferente de cortar A/V juntos (que criaria saltos no áudio).
  O áudio que estava "por baixo" dos frames pretos permanece — e agora o
  vídeo está alinhado com ele.

MODOS:
  --mode=video-only  [DEFAULT] Remove frames pretos só do vídeo. Áudio intacto.
                     Correto para: capturadora inserindo frames extras, VHS
                     com áudio contínuo sob os dropouts.

  --mode=av-sync     Remove frames pretos de vídeo E áudio juntos.
                     Correto para: líderes/trailers (início e fim da fita,
                     onde não há conteúdo útil em nenhum stream).
                     Cuidado: remove áudio que estava tocando sob o preto.

  --mode=auto        [RECOMENDADO] Usa video-only para gaps no meio do vídeo,
                     av-sync para remover o líder inicial e trailer final.
                     Combina as duas estratégias no lugar certo.

SOBRE OS JUMPS VISUAIS:
  Após a remoção dos frames pretos, haverá um salto visual entre o frame
  anterior ao gap e o frame posterior. Isso é ESPERADO e CORRETO — é o
  mesmo comportamento de um editor de vídeo ao fazer um corte.
  O jump é muito menos perceptível do que frames pretos prolongados ou
  dessincronização crescente de áudio.

  Para minimizar o jump: use --fade-frames=N para fazer um blend/dissolve
  curto (ex: 3 frames) nos pontos de corte.
"""

import sys
import os
import re
import math
import argparse
import subprocess
import shutil


# ---------------------------------------------------------------------------
# Helpers de ffprobe
# ---------------------------------------------------------------------------

def get_stream_info(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "csv=p=0",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not res.stdout.strip():
        raise RuntimeError(f"ffprobe stream info falhou: {res.stderr}")
    parts = res.stdout.strip().split("\n")[0].split(",")
    width = int(parts[0])
    height = int(parts[1])
    r_frame_rate = parts[2]

    cmd_a = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels",
        "-of", "csv=p=0",
        input_file
    ]
    res_a = subprocess.run(cmd_a, capture_output=True, text=True)
    has_audio = bool(res_a.stdout.strip())

    return width, height, r_frame_rate, has_audio


def get_fps(r_frame_rate: str) -> float:
    if "/" in r_frame_rate:
        num, den = r_frame_rate.split("/")
        return float(num) / float(den)
    return float(r_frame_rate)


def get_duration(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe falhou: {res.stderr}")
    return float(res.stdout.strip())


# ---------------------------------------------------------------------------
# Detecção de frames pretos
# ---------------------------------------------------------------------------

def detect_black_intervals(input_file, min_duration=0.020, pix_th=0.12, pic_th=0.96):
    """
    Detecta intervalos de frames pretos.
    min_duration=0.020 = 1 frame @ 50fps (padrão para vídeo pós-deinterlace 50p).
    Para vídeo original 25i, use min_duration=0.040 (1 frame @ 25fps).
    """
    cmd = [
        "ffmpeg", "-hide_banner",
        "-i", input_file,
        "-vf", f"blackdetect=d={min_duration}:pix_th={pix_th}:pic_th={pic_th}",
        "-an", "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    intervals = []
    pattern = re.compile(r"black_start:([0-9.]+)\s+black_end:([0-9.]+)")
    for line in res.stderr.splitlines():
        m = pattern.search(line)
        if m:
            # Sem padding negativo no start — não morde conteúdo válido.
            # +5ms no end para garantir que o último frame preto seja incluído.
            start = float(m.group(1))
            end   = float(m.group(2)) + 0.005
            intervals.append((start, end))
    return intervals


def merge_intervals(intervals, gap_threshold=0.04):
    """Funde intervalos pretos próximos (gap ≤ gap_threshold segundos)."""
    if not intervals:
        return []
    merged = [list(intervals[0])]
    for s, e in intervals[1:]:
        prev_s, prev_e = merged[-1]
        if s <= prev_e + gap_threshold:
            merged[-1][1] = max(prev_e, e)
        else:
            merged.append([s, e])
    return [(max(0.0, s), e) for s, e in merged]


def classify_intervals(black_intervals, total_duration, leader_threshold=2.0):
    """
    Separa os intervalos pretos em:
      - leader:  início da fita (antes de qualquer conteúdo)
      - trailer: fim da fita (depois do último conteúdo)
      - gap:     pretos no meio (dropouts, falhas de sinal)

    Retorna (leader, gaps, trailer) onde cada item é (start, end) ou None.
    """
    if not black_intervals:
        return None, [], None

    leader = None
    trailer = None
    gaps = []

    first = black_intervals[0]
    last  = black_intervals[-1]

    # Líder: primeiro intervalo começa no início (ou muito perto)
    if first[0] <= leader_threshold:
        leader = first
        black_intervals = black_intervals[1:]

    # Trailer: último intervalo vai até o final (ou muito perto)
    if black_intervals and black_intervals[-1][1] >= total_duration - leader_threshold:
        trailer = black_intervals[-1]
        black_intervals = black_intervals[:-1]

    gaps = black_intervals
    return leader, gaps, trailer


# ---------------------------------------------------------------------------
# Modo video-only: remove frames pretos do vídeo, áudio intacto
# ---------------------------------------------------------------------------

def remove_black_video_only(input_file, output_file, black_gaps, total_duration, fade_frames=0):
    """
    Remove os frames pretos APENAS do stream de vídeo.
    O áudio é copiado INTACTO — sem nenhum corte.

    Resultado: o vídeo fica mais curto que o áudio nos pontos de corte,
    mas isso CORRIGE a dessincronização que os frames extras causavam.

    Mecanismo:
      - Usa o filtro `select` para selecionar apenas os frames não-pretos.
      - `setpts=N/(FRAME_RATE*TB)` reconstrói os timestamps dos frames
        selecionados de forma contínua, sem buracos.
      - O áudio é copiado diretamente com -c:a copy.

    Para cada gap removido, o vídeo "salta" visualmente — o frame antes
    do gap e o frame depois do gap ficam adjacentes. Isso é correto.
    """
    _, _, r_frame_rate, has_audio = get_stream_info(input_file)

    if not black_gaps:
        # Nenhum gap no meio — copia direto
        print("[TRIM] Nenhum gap de preto no meio do vídeo. Copiando...")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-i", input_file,
               "-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1"]
        if has_audio:
            cmd += ["-c:a", "copy"]
        cmd += [output_file]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"ffmpeg copy falhou: {res.stderr}")
        return

    # Constrói expressão `select` para excluir os intervalos pretos.
    # A expressão seleciona frames FORA de todos os gaps.
    # Formato: not(between(t,start1,end1)+between(t,start2,end2)+...)
    between_exprs = "+".join(
        f"between(t,{s:.4f},{e:.4f})" for s, e in black_gaps
    )
    select_expr = f"not({between_exprs})"

    # setpts reconstrói timestamps contínuos: N/(frame_rate*TB)
    # Isso elimina os buracos de tempo deixados pelos frames removidos.
    vf = f"select='{select_expr}',setpts=N/({r_frame_rate}*TB)"

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-i", input_file,
        "-vf", vf,
        "-vsync", "vfr",          # Variable frame rate — essencial com select
        "-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1",
    ]
    if has_audio:
        # ÁUDIO COPIADO INTACTO — não tocamos nos timestamps do áudio.
        # O vídeo encurtado vai se realinhar com o áudio contínuo.
        cmd += ["-c:a", "copy"]
    cmd += [output_file]

    print(f"[TRIM] Removendo {len(black_gaps)} gap(s) preto(s) do vídeo (áudio intacto)...")
    for s, e in black_gaps:
        print(f"  - {s:.3f}s → {e:.3f}s ({e-s:.3f}s removido do vídeo)")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg select falhou: {res.stderr[-3000:]}")


# ---------------------------------------------------------------------------
# Modo av-sync: remove vídeo E áudio (para líderes e trailers)
# ---------------------------------------------------------------------------

def trim_av_sync(input_file, output_file, keep_start, keep_end):
    """
    Corta vídeo E áudio para a janela [keep_start, keep_end].
    Use apenas para remover líder inicial e trailer final,
    onde não há conteúdo útil em nenhum dos dois streams.
    """
    _, _, _, has_audio = get_stream_info(input_file)

    filters = [
        f"[0:v]trim=start={keep_start:.4f}:end={keep_end:.4f},setpts=PTS-STARTPTS[vout]"
    ]
    maps = ["-map", "[vout]"]
    audio_args = []

    if has_audio:
        filters.append(
            f"[0:a]atrim=start={keep_start:.4f}:end={keep_end:.4f},asetpts=PTS-STARTPTS[aout]"
        )
        maps += ["-map", "[aout]"]
        audio_args = ["-c:a", "pcm_s16le"]

    filter_complex = ";".join(filters)

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-i", input_file,
        "-filter_complex", filter_complex,
    ] + maps + [
        "-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1",
    ] + audio_args + [output_file]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg av-sync trim falhou: {res.stderr[-3000:]}")


# ---------------------------------------------------------------------------
# Modo auto: combina video-only (gaps) + av-sync (líder/trailer)
# ---------------------------------------------------------------------------

def process_auto(input_file, output_file, black_intervals, total_duration,
                 leader_threshold=2.0, fade_frames=0):
    """
    Estratégia combinada:
      1. Remove líder inicial e trailer final com av-sync (corta ambos os streams).
      2. Remove gaps intermediários com video-only (preserva áudio contínuo).
    """
    leader, gaps, trailer = classify_intervals(
        list(black_intervals), total_duration, leader_threshold
    )

    keep_start = leader[1] if leader else 0.0
    keep_end   = trailer[0] if trailer else total_duration

    if leader:
        print(f"[TRIM] Líder inicial detectado: {leader[0]:.3f}s → {leader[1]:.3f}s")
    if trailer:
        print(f"[TRIM] Trailer final detectado: {trailer[0]:.3f}s → {trailer[1]:.3f}s")
    if gaps:
        total_gap = sum(e - s for s, e in gaps)
        print(f"[TRIM] {len(gaps)} gap(s) intermediário(s) = {total_gap:.3f}s de preto no vídeo")

    # Ajusta os timestamps dos gaps para a janela já cortada pelo líder
    adjusted_gaps = [
        (max(0.0, s - keep_start), max(0.0, e - keep_start))
        for s, e in gaps
        if e > keep_start and s < keep_end
    ]

    # Passo 1: remove líder e trailer (A/V sync)
    if leader or trailer:
        temp_cut = output_file + ".leader_cut.mkv"
        print(f"[TRIM] Removendo líder/trailer (A/V sync): janela [{keep_start:.3f}s, {keep_end:.3f}s]")
        trim_av_sync(input_file, temp_cut, keep_start, keep_end)
    else:
        temp_cut = input_file

    # Passo 2: remove gaps intermediários (somente vídeo)
    if adjusted_gaps:
        remove_black_video_only(temp_cut, output_file, adjusted_gaps,
                                keep_end - keep_start, fade_frames)
    else:
        if temp_cut == input_file:
            shutil.copy2(input_file, output_file)
        elif temp_cut != output_file:
            os.replace(temp_cut, output_file)

    # Limpeza do temp
    if temp_cut != input_file and temp_cut != output_file and os.path.exists(temp_cut):
        try:
            os.remove(temp_cut)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Remove frames pretos do vídeo VHS preservando o áudio contínuo.\n"
            "Usa video-only removal para gaps intermediários (preserva sincronia)\n"
            "e av-sync para líder/trailer (remove conteúdo inútil de ambos streams)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("input",  help="Arquivo de vídeo de entrada")
    parser.add_argument("output", help="Arquivo de saída (ou diretório)")
    parser.add_argument(
        "--mode", choices=["video-only", "av-sync", "auto"], default="auto",
        help=(
            "auto [padrão]: video-only para gaps, av-sync para líder/trailer. "
            "video-only: só remove do vídeo, áudio intacto. "
            "av-sync: remove de ambos os streams (use para cortes simples)."
        )
    )
    parser.add_argument("--min-duration", type=float, default=0.020,
                        help="Duração mínima do preto para detecção (padrão: 0.020s = 1 frame @ 50fps)")
    parser.add_argument("--pix-th",  type=float, default=0.12,
                        help="Limiar de brilho por pixel para preto (padrão: 0.12)")
    parser.add_argument("--pic-th",  type=float, default=0.96,
                        help="Fração mínima da tela preta (padrão: 0.96)")
    parser.add_argument("--leader-threshold", type=float, default=2.0,
                        help="Distância do início/fim para classificar como líder/trailer (padrão: 2.0s)")
    parser.add_argument("--skip-doc", action="store_true",
                        help="(Legado) sem efeito — DOC não é mais executado aqui")
    parser.add_argument("--fade-frames", type=int, default=0,
                        help="Frames de blend nos pontos de corte de gap (0=desabilitado)")

    args = parser.parse_args()

    # Resolve paths
    input_path = os.path.abspath(args.input)
    if not os.path.exists(input_path):
        print(f"[ERRO] Arquivo de entrada não encontrado: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = os.path.abspath(args.output)
    if os.path.isdir(output_path) or not output_path.endswith((".mkv", ".mov", ".mp4")):
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(output_path, f"{base_name}_trimmed.mkv")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"[TRIM] Entrada: {input_path}")
    total_dur = get_duration(input_path)
    _, _, r_frame_rate, has_audio = get_stream_info(input_path)
    fps = get_fps(r_frame_rate)
    print(f"[TRIM] Duração: {total_dur:.3f}s | {fps:.3f}fps | áudio: {'sim' if has_audio else 'não'}")
    print(f"[TRIM] Modo: {args.mode}")

    # Detecta e funde intervalos pretos
    raw_blacks  = detect_black_intervals(input_path, args.min_duration, args.pix_th, args.pic_th)
    merged      = merge_intervals(raw_blacks)

    if not merged:
        print("[TRIM] Nenhum frame preto detectado. Copiando sem alteração.")
        shutil.copy2(input_path, output_path)
        sys.exit(0)

    print(f"[TRIM] {len(merged)} intervalo(s) preto(s) detectado(s) (total: "
          f"{sum(e-s for s,e in merged):.3f}s):")
    for s, e in merged:
        print(f"  {s:.3f}s → {e:.3f}s  ({e-s:.3f}s)")

    # Executa o modo selecionado
    if args.mode == "video-only":
        remove_black_video_only(input_path, output_path, merged, total_dur, args.fade_frames)

    elif args.mode == "av-sync":
        # Para av-sync puro: computa segmentos de conteúdo e concatena tudo
        keep_segs = []
        t = 0.0
        for s, e in merged:
            if s > t + 0.01:
                keep_segs.append((t, s))
            t = e
        if t < total_dur - 0.01:
            keep_segs.append((t, total_dur))

        if not keep_segs:
            print("[AVISO] Vídeo é inteiramente preto. Nada a fazer.", file=sys.stderr)
            sys.exit(0)

        # Para av-sync com múltiplos segmentos, usa filter_complex concat
        _, _, _, _has_audio = get_stream_info(input_path)
        filters = []
        concat_inputs = []
        for i, (st, en) in enumerate(keep_segs):
            filters.append(f"[0:v]trim=start={st:.4f}:end={en:.4f},setpts=PTS-STARTPTS[v{i}]")
            if _has_audio:
                filters.append(f"[0:a]atrim=start={st:.4f}:end={en:.4f},asetpts=PTS-STARTPTS[a{i}]")
                concat_inputs.append(f"[v{i}][a{i}]")
            else:
                concat_inputs.append(f"[v{i}]")
        n = len(keep_segs)
        if _has_audio:
            filters.append("".join(concat_inputs) + f"concat=n={n}:v=1:a=1[vout][aout]")
        else:
            filters.append("".join(concat_inputs) + f"concat=n={n}:v=1:a=0[vout]")
        fc = ";".join(filters)
        cmd = ["ffmpeg", "-y", "-hide_banner", "-i", input_path,
               "-filter_complex", fc, "-map", "[vout]"]
        if _has_audio:
            cmd += ["-map", "[aout]", "-c:a", "pcm_s16le"]
        cmd += ["-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1", output_path]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"ffmpeg av-sync falhou: {res.stderr[-3000:]}")

    else:  # auto
        process_auto(input_path, output_path, merged, total_dur,
                     args.leader_threshold, args.fade_frames)

    new_dur = get_duration(output_path)
    print(f"\n[TRIM] ✓ Concluído: {output_path}")
    print(f"[TRIM]   Duração vídeo: {total_dur:.3f}s → {new_dur:.3f}s")
    if has_audio:
        print(f"[TRIM]   Áudio: preservado 100% contínuo (não cortado nos gaps)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
generate_synthetic_test_tape.py - Gerador de Sinal Sintético de Teste VHS
Cria um vídeo simulando perfeitamente os desafios de uma captura VHS real:
  - 2.0s de líder inicial preto (sem sinal de gravação)
  - 3.0s de sinal útil (SMPTE colorbars) com áudio senoidal 1kHz
  - 1.5s de perda de sinal no meio (dropout de tela preta com áudio de fundo contínuo)
  - 3.5s de sinal útil recuperado
Gera um arquivo MKV entrelaçado 720x480 NTSC @ 29.97 fps.
"""

import sys
import os
import subprocess

def generate_test_clip(output_path="tests/vhs_test_synthetic.mkv"):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    filter_complex = (
        # 1. Segmento 1: Líder preto (2s) com silêncio
        "color=c=black:s=720x480:r=60000/1001:d=2.0[v_lead];"
        "anullsrc=r=48000:cl=stereo:d=2.0[a_lead];"

        # 2. Segmento 2: Barras de cor (3.0s) com tom de 1000Hz
        "smptebars=s=720x480:r=60000/1001:d=3.0[v_seg1];"
        "sine=f=1000:r=48000:d=3.0[a_seg1];"

        # 3. Segmento 3: Perda de sinal (1.5s) tela preta com áudio contínuo (ruído/tom 440Hz)
        "color=c=black:s=720x480:r=60000/1001:d=1.5[v_gap];"
        "sine=f=440:r=48000:d=1.5[a_gap];"

        # 4. Segmento 4: Retorno da gravação (3.5s) com tom de 1000Hz
        "smptebars=s=720x480:r=60000/1001:d=3.5[v_seg2];"
        "sine=f=1000:r=48000:d=3.5[a_seg2];"

        # Concatena os 4 blocos
        "[v_lead][a_lead][v_seg1][a_seg1][v_gap][a_gap][v_seg2][a_seg2]concat=n=4:v=1:a=1[v_prog][a_out];"

        # Entrelaça o vídeo para simular sinal BFF analógico de fita VHS
        "[v_prog]tinterlace=mode=interleave_bottom,setfield=mode=bff[v_out]"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-filter_complex", filter_complex,
        "-map", "[v_out]", "-map", "[a_out]",
        "-c:v", "ffv1", "-level", "3", "-g", "1", "-slices", "24", "-slicecrc", "1",
        "-c:a", "pcm_s16le",
        output_path
    ]

    print(f"[TESTE] Gerando fita sintética VHS em: {output_path}...", flush=True)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERRO] Falha ao gerar vídeo de teste: {res.stderr}", file=sys.stderr)
        sys.exit(1)

    print(f"[TESTE] Vídeo de teste gerado com sucesso! (Duração: 10.0s)", flush=True)

if __name__ == "__main__":
    generate_test_clip()

"""
VHS Studio - Script de Restauração Automática para OBS Studio (Python)
Monitora as gravações do OBS Studio e aciona o pipeline de restauração master ao encerrar.
"""

import obspython as obs
import subprocess
import os
import sys

auto_restore = True
deinterlacer = "bwdif"
apply_denoise = False
apply_chroma = False
output_format = "h264"
crf_value = 18

def script_description():
    return """<h2>VHS Studio - Restauração Automática (Python)</h2>
<p>Monitora as gravações feitas pelo OBS Studio.</p>
<p>Dispara automaticamente o pipeline de restauração assim que a gravação é encerrada.</p>
<p><b>Destino:</b> <code>media/output/</code></p>"""

def get_project_root():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # de capture/obs -> volta 2 níveis
    root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    return root

def run_pipeline_for_file(filepath):
    if not filepath or not os.path.exists(filepath):
        obs.script_log(obs.LOG_WARNING, f"[VHS Auto-Restore] Arquivo não encontrado: {filepath}")
        return

    root = get_project_root()
    bat_path = os.path.join(root, "restoration", "run_pipeline.bat")

    trim_black = True
    extra_opts = "--vhs"
    if deinterlacer == "bwdif":
        extra_opts += " --bwdif"
    else:
        extra_opts += " --qtgmc"

    if trim_black:
        extra_opts += " --trim-black"

    if apply_denoise:
        extra_opts += " --denoise"

    if apply_chroma:
        extra_opts += " --chroma-fix"

    if output_format == "prores":
        extra_opts += " --prores"
    else:
        extra_opts += f" --crf {crf_value}"

    obs.script_log(obs.LOG_INFO, f"[VHS Auto-Restore] Disparando restauração: {filepath}")
    obs.script_log(obs.LOG_INFO, f"[VHS Auto-Restore] Opções: {extra_opts}")

    cmd = f'start "VHS Studio - Restauracao" cmd /c call "{bat_path}" "{filepath}" "{extra_opts}"'
    subprocess.Popen(cmd, shell=True)

def on_event(event):
    if event == obs.OBS_FRONTEND_EVENT_RECORDING_STOPPED:
        if not auto_restore:
            return

        last_rec = obs.obs_frontend_get_last_recording()
        obs.script_log(obs.LOG_INFO, f"[VHS Auto-Restore] Gravação finalizada: {last_rec}")

        # Aguarda 1s para o OBS liberar o arquivo
        def delayed_call():
            obs.remove_current_callback()
            run_pipeline_for_file(last_rec)

        obs.timer_add(delayed_call, 1000)

def test_restore_clicked(props, prop):
    last_rec = obs.obs_frontend_get_last_recording()
    if last_rec and os.path.exists(last_rec):
        run_pipeline_for_file(last_rec)
    else:
        root = get_project_root()
        test_file = os.path.join(root, "media", "raw", "Untitled.mov")
        run_pipeline_for_file(test_file)

def open_raw_folder(props, prop):
    root = get_project_root()
    os.system(f'explorer.exe "{os.path.join(root, "media", "raw")}"')

def open_output_folder(props, prop):
    root = get_project_root()
    os.system(f'explorer.exe "{os.path.join(root, "media", "output")}"')

def script_properties():
    props = obs.obs_properties_create()
    obs.obs_properties_add_bool(props, "auto_restore", "Disparar restauração automaticamente ao parar gravação")

    deint_list = obs.obs_properties_add_list(props, "deinterlacer", "Algoritmo de Desentrelaçamento", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(deint_list, "BWDIF (Double-rate 50/60p, Rápido e Estável)", "bwdif")
    obs.obs_property_list_add_string(deint_list, "QTGMC (VapourSynth, Qualidade Máxima)", "qtgmc")

    fmt_list = obs.obs_properties_add_list(props, "output_format", "Formato Final de Saída", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(fmt_list, "H.264 MP4 (Web, TV e Compartilhamento)", "h264")
    obs.obs_property_list_add_string(fmt_list, "Apple ProRes MOV (Edição Profissional NLE)", "prores")

    obs.obs_properties_add_int(props, "crf_value", "Qualidade CRF (H.264)", 14, 28, 1)
    obs.obs_properties_add_bool(props, "apply_denoise", "Redução de Ruído (Denoise hqdn3d)")
    obs.obs_properties_add_bool(props, "apply_chroma", "Correção de Vazamento de Cor (Chroma Shift)")

    obs.obs_properties_add_button(props, "btn_test", "Processar Última Gravação Agora", test_restore_clicked)
    obs.obs_properties_add_button(props, "btn_raw", "Abrir Pasta de Capturas (media/raw)", open_raw_folder)
    obs.obs_properties_add_button(props, "btn_output", "Abrir Pasta de Saída (media/output)", open_output_folder)
    return props

def script_defaults(settings):
    obs.obs_data_set_default_bool(settings, "auto_restore", True)
    obs.obs_data_set_default_string(settings, "deinterlacer", "bwdif")
    obs.obs_data_set_default_string(settings, "output_format", "h264")
    obs.obs_data_set_default_int(settings, "crf_value", 18)
    obs.obs_data_set_default_bool(settings, "apply_denoise", False)
    obs.obs_data_set_default_bool(settings, "apply_chroma", False)

def script_update(settings):
    global auto_restore, deinterlacer, output_format, crf_value, apply_denoise, apply_chroma
    auto_restore = obs.obs_data_get_bool(settings, "auto_restore")
    deinterlacer = obs.obs_data_get_string(settings, "deinterlacer")
    output_format = obs.obs_data_get_string(settings, "output_format")
    crf_value = obs.obs_data_get_int(settings, "crf_value")
    apply_denoise = obs.obs_data_get_bool(settings, "apply_denoise")
    apply_chroma = obs.obs_data_get_bool(settings, "apply_chroma")

def script_load(settings):
    obs.obs_frontend_add_event_callback(on_event)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Plugin Python carregado com sucesso.")

def script_unload():
    obs.obs_frontend_remove_event_callback(on_event)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Plugin Python descarregado.")

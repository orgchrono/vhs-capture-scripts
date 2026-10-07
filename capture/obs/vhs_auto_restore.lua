obs = obslua

-- Configurações gerais
local auto_restore = true
local hardware_device = "jvc_hr_d227m"
local restore_mode = "direct"
local deinterlacer = "bwdif"
local apply_denoise = false
local apply_chroma = false
local output_format = "h264"
local crf_value = 18
local trim_black = true
local min_duration_sec = 10

function script_description()
    return [[<h2>📼 VHS Studio - Automação & Restauração Master</h2>
<p>Sistema profissional para captura e restauração de fitas VHS com Panasonic DMR-EH55 Passthrough:</p>
<ul>
  <li><b>Disparo Automático:</b> Ao encerrar a gravação no OBS, o pipeline de restauração inicia com os parâmetros do seu equipamento.</li>
  <li><b>Perfis de Hardware:</b> JVC HR-D227M (Estéreo Hi-Fi) ou Câmera JVC GR-AX410 (VHS-C Mono).</li>
  <li><b>TBC Frame-Hold:</b> Preserva sincronia labial 100% contínua sem aceleração artificial de vídeo.</li>
</ul>]]
end

function get_project_root()
    local script_path = script_path()
    script_path = string.gsub(script_path, "/", "\\")
    local root = string.match(script_path, "(.*)\\capture\\obs\\")
    if not root or root == "" then
        root = string.match(script_path, "(.*)\\capture\\")
    end
    if not root or root == "" then
        root = "C:\\Users\\danie\\Downloads\\vhs-capture-scripts-main"
    end
    return root
end

function run_pipeline_for_file(filepath)
    if not filepath or filepath == "" then
        obs.script_log(obs.LOG_WARNING, "[VHS Auto-Restore] Nenhum arquivo fornecido para restauração.")
        return
    end

    local root = get_project_root()
    local bat_path = root .. "\\restoration\\run_pipeline.bat"

    -- Monta opções extras com suporte a hardware e modo
    local extra_opts = "--device " .. hardware_device

    if restore_mode == "master" then
        extra_opts = extra_opts .. " --master"
    end

    if deinterlacer == "bwdif" then
        extra_opts = extra_opts .. " --bwdif"
    else
        extra_opts = extra_opts .. " --qtgmc"
    end

    if trim_black then
        extra_opts = extra_opts .. " --trim-black"
    end

    if apply_denoise then
        extra_opts = extra_opts .. " --denoise"
    end

    if apply_chroma then
        extra_opts = extra_opts .. " --chroma-fix"
    end

    if output_format == "prores" then
        extra_opts = extra_opts .. " --prores"
    else
        extra_opts = extra_opts .. " --crf " .. tostring(crf_value)
    end

    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Disparando pipeline para: " .. filepath)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Aparelho: " .. hardware_device .. " | Modo: " .. restore_mode)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Opções: " .. extra_opts)

    local cmd = string.format('start "VHS Studio - Restauracao" cmd /k ""%s" "%s" %s"', bat_path, filepath, extra_opts)
    os.execute(cmd)
end

function on_event(event)
    if event == obs.OBS_FRONTEND_EVENT_RECORDING_STOPPED then
        if not auto_restore then
            obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Gravação encerrada (Auto-restauração desativada).")
            return
        end

        local last_rec = obs.obs_frontend_get_last_recording()
        if not last_rec or last_rec == "" then
            return
        end

        obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Gravação concluída: " .. tostring(last_rec))

        obs.timer_add(function()
            obs.remove_current_callback()
            -- Verificação básica de tamanho de arquivo para descartar capturas acidentais (< 2MB)
            local f = io.open(last_rec, "rb")
            if f then
                local size = f:seek("end")
                f:close()
                if size and size < 2000000 then
                    obs.script_log(obs.LOG_WARNING, "[VHS Auto-Restore] Gravação muito curta (< 2MB). Restauração ignorada.")
                    return
                end
            end
            run_pipeline_for_file(last_rec)
        end, 1200)
    end
end

function test_restore_clicked(props, prop)
    local last_rec = obs.obs_frontend_get_last_recording()
    if last_rec and last_rec ~= "" then
        run_pipeline_for_file(last_rec)
    else
        local root = get_project_root()
        local test_file = root .. "\\media\\raw\\2026-10-02 13-48-53.mkv"
        obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Testando restauração com arquivo modelo: " .. test_file)
        run_pipeline_for_file(test_file)
    end
end

function open_raw_folder(props, prop)
    local root = get_project_root()
    os.execute(string.format('explorer.exe "%s\\media\\raw"', root))
end

function open_output_folder(props, prop)
    local root = get_project_root()
    os.execute(string.format('explorer.exe "%s\\media\\output"', root))
end

function script_properties()
    local props = obs.obs_properties_create()

    obs.obs_properties_add_bool(props, "auto_restore", "🚀 Disparar restauração automaticamente ao parar gravação")

    local dev_list = obs.obs_properties_add_list(props, "hardware_device", "📼 Aparelho de Reprodução", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(dev_list, "JVC HR-D227M (VHS Hi-Fi Estéreo)", "jvc_hr_d227m")
    obs.obs_property_list_add_string(dev_list, "JVC GR-AX410 (Câmera VHS-C Mono)", "jvc_gr_ax410")

    local mode_list = obs.obs_properties_add_list(props, "restore_mode", "Modo de Restauração", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(mode_list, "Direta Streaming (Acelerada, TBC Frame-Hold, 1080p)", "direct")
    obs.obs_property_list_add_string(mode_list, "Master Completa (Multi-estágios Lossless via Bash)", "master")

    obs.obs_properties_add_bool(props, "trim_black", "✂ Neutralizar perdas de sinal (TBC Frame-Hold)")

    local deint_list = obs.obs_properties_add_list(props, "deinterlacer", "Algoritmo de Desentrelaçamento", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(deint_list, "BWDIF (Double-rate 60/50p suave, recomendado)", "bwdif")
    obs.obs_property_list_add_string(deint_list, "QTGMC (VapourSynth, requer vspipe)", "qtgmc")

    local fmt_list = obs.obs_properties_add_list(props, "output_format", "Formato Final de Saída", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    obs.obs_property_list_add_string(fmt_list, "H.264 MP4 (Universal TV/Web Rec.709)", "h264")
    obs.obs_property_list_add_string(fmt_list, "Apple ProRes MOV (Edição Master NLE)", "prores")

    obs.obs_properties_add_int(props, "crf_value", "Qualidade CRF (H.264)", 14, 28, 1)
    obs.obs_properties_add_bool(props, "apply_denoise", "Redução de Ruído (Denoise hqdn3d)")
    obs.obs_properties_add_bool(props, "apply_chroma", "Correção de Vazamento de Cor (Chroma Shift)")

    obs.obs_properties_add_button(props, "btn_test", "Processar Última Gravação Agora", test_restore_clicked)
    obs.obs_properties_add_button(props, "btn_raw", "Abrir Pasta de Capturas (media/raw)", open_raw_folder)
    obs.obs_properties_add_button(props, "btn_output", "Abrir Pasta de Saída (media/output)", open_output_folder)

    return props
end

function script_defaults(settings)
    obs.obs_data_set_default_bool(settings, "auto_restore", true)
    obs.obs_data_set_default_string(settings, "hardware_device", "jvc_hr_d227m")
    obs.obs_data_set_default_string(settings, "restore_mode", "direct")
    obs.obs_data_set_default_bool(settings, "trim_black", true)
    obs.obs_data_set_default_string(settings, "deinterlacer", "bwdif")
    obs.obs_data_set_default_string(settings, "output_format", "h264")
    obs.obs_data_set_default_int(settings, "crf_value", 18)
    obs.obs_data_set_default_bool(settings, "apply_denoise", false)
    obs.obs_data_set_default_bool(settings, "apply_chroma", false)
end

function script_update(settings)
    auto_restore = obs.obs_data_get_bool(settings, "auto_restore")
    hardware_device = obs.obs_data_get_string(settings, "hardware_device")
    restore_mode = obs.obs_data_get_string(settings, "restore_mode")
    trim_black = obs.obs_data_get_bool(settings, "trim_black")
    deinterlacer = obs.obs_data_get_string(settings, "deinterlacer")
    output_format = obs.obs_data_get_string(settings, "output_format")
    crf_value = obs.obs_data_get_int(settings, "crf_value")
    apply_denoise = obs.obs_data_get_bool(settings, "apply_denoise")
    apply_chroma = obs.obs_data_get_bool(settings, "apply_chroma")
end

function script_load(settings)
    obs.obs_frontend_add_event_callback(on_event)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Plugin ativo e integrado à pipeline.")
end

function script_unload()
    obs.obs_frontend_remove_event_callback(on_event)
    obs.script_log(obs.LOG_INFO, "[VHS Auto-Restore] Plugin descarregado.")
end

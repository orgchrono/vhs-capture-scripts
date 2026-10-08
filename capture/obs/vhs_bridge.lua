obslua = obslua

function on_event(event)
    if event == obslua.OBS_FRONTEND_EVENT_RECORDING_STOPPED then
        local last_rec = obslua.obs_frontend_get_last_recording()
        if not last_rec or last_rec == "" then
            return
        end

        local f = io.open(last_rec, "rb")
        if f then
            local size = f:seek("end")
            f:close()
            if size and size < 2000000 then
                obslua.script_log(obslua.LOG_WARNING, "[VHS Bridge] Gravação ignorada por ser muito curta.")
                return
            end
        end

        -- Write the event to the pipeline.jsonl queue
        local script_path = obslua.script_path()
        script_path = string.gsub(script_path, "/", "\\")
        local root = string.match(script_path, "(.*)\\capture\\obs\\")
        local queue_file = root .. "\\media\\work\\pipeline.jsonl"
        
        local out = io.open(queue_file, "a")
        if out then
            out:write('{"event": "recording_stopped", "file": "' .. string.gsub(last_rec, "\\", "\\\\") .. '"}\n')
            out:close()
            obslua.script_log(obslua.LOG_INFO, "[VHS Bridge] Evento enfileirado para " .. last_rec)
        end
    end
end

function script_load(settings)
    obslua.obs_frontend_add_event_callback(on_event)
    obslua.script_log(obslua.LOG_INFO, "[VHS Bridge] Carregado. Escutando gravações.")
end

function script_unload()
    obslua.obs_frontend_remove_event_callback(on_event)
end

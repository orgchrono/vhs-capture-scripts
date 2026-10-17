"""Unit tests for QualityControl artifact detection and reporting."""

import os
from unittest.mock import patch
from vhs_studio.capture.qc import QualityControl


def test_quality_control_run_qc_on_nonexistent(tmp_path):
    fake_file = str(tmp_path / "nonexistent.mkv")
    result = QualityControl.run_qc(fake_file)
    assert result is None


def test_quality_control_catalog_defects():
    meta = {
        "width": 708,
        "height": 480,
        "fps": 29.97,
        "duration": 600.0,
        "video_codec": "h264",
        "audio_codec": "aac",
    }
    leader_sec = 66.5
    interlace = {"is_interlaced": True, "summary": "Interlaced (BFF)"}
    audio = {
        "layout": "mono_l",
        "reason": "Canal R mudo (-89 dB) enquanto L tem sinal.",
    }
    signal = {
        "max_dropout_tout": 6.5,
        "avg_dropout_tout": 1.2,
        "min_luma_sampled": 16.0,
        "max_luma_sampled": 235.0,
        "dropout_risk": "alta",
    }

    defects = QualityControl._catalog_defects(meta, leader_sec, interlace, audio, signal)
    defect_names = [d["defect"] for d in defects]

    assert any("Líder Inicial" in name for name in defect_names)
    assert any("Head Switching" in name for name in defect_names)
    assert any("Combing" in name for name in defect_names)
    assert any("Dropouts" in name for name in defect_names)
    assert any("Assimetria" in name for name in defect_names)
    assert any("Resolução de Captura Assimétrica" in name for name in defect_names)


def test_quality_control_generate_markdown_report():
    sample_data = {
        "metadata": {
            "duration": 120.0,
            "width": 720,
            "height": 480,
            "fps": 29.97,
            "video_codec": "h264",
            "audio_codec": "aac",
            "audio_channels": 2,
            "audio_sample_rate": 48000,
            "pix_fmt": "yuv420p",
        },
        "black_leader_sec": 5.0,
        "interlace_status": {"summary": "Progressive"},
        "audio_layout": {"reason": "Estéreo balanceado."},
        "signal_metrics": {
            "max_dropout_tout": 0.5,
            "avg_dropout_tout": 0.1,
            "min_luma_sampled": 16.0,
            "max_luma_sampled": 235.0,
            "dropout_risk": "baixa",
        },
        "defects_catalog": [
            {
                "defect": "Head Switching Noise",
                "timecode_range": "00:00:05.000 -> 00:02:00.000",
                "affected_lines": "Linhas 464 a 480",
                "cause": "Comutação de cabeças",
                "severity": "Contínua",
                "recommended_fix": "overscan_blanking",
            }
        ],
    }

    md = QualityControl.generate_markdown_report("test_tape.mkv", sample_data)
    assert "# Relatório de Inspeção Técnica e Defeitos: `test_tape.mkv`" in md
    assert "Head Switching Noise" in md
    assert "overscan_blanking" in md


@patch.object(QualityControl, "inspect_media")
def test_quality_control_run_qc_success(mock_inspect, tmp_path):
    test_video = tmp_path / "sample.mkv"
    test_video.write_bytes(b"dummy")

    mock_inspect.return_value = {
        "metadata": {"duration": 10.0, "width": 720, "height": 480, "fps": 30.0},
        "black_leader_sec": 0.0,
        "interlace_status": {},
        "audio_layout": {},
        "signal_metrics": {},
        "defects_catalog": [],
    }

    report_json = QualityControl.run_qc(str(test_video))
    assert report_json is not None
    assert os.path.exists(report_json)
    assert os.path.exists(f"{test_video}_defect_report.md")


def test_build_pipeline_tools_registry_completeness():
    from vhs_studio.capture.qc import build_pipeline_tools_registry

    tools_list = build_pipeline_tools_registry(
        params={
            "comb_filter": True,
            "chroma_fix": True,
            "denoise": True,
            "ai_face_restore": True,
            "ai_rife_60fps": True,
            "ai_upscaler": True,
        },
        resolved_deint="qtgmc",
        audio_mode="mono_l",
        start_sec=12.5,
    )
    reg_by_id = {t["tool_id"]: t for t in tools_list}
    expected_tools = {
        "leader_trim_sync",
        "digital_tbc_frame_hold",
        "overscan_blanking_mask",
        "magnetic_dropout_cleaner",
        "comb_filter_3d",
        "chroma_phase_alignment",
        "spatio_temporal_denoiser",
        "deinterlacing_engine",
        "colorimetry_geometry_standardizer",
        "audio_conditioning_dsp",
        "ai_face_restoration",
        "ai_rife_interpolation",
        "ai_super_resolution",
        "ai_whisper_transcription",
        "scene_segmentation",
    }
    assert expected_tools.issubset(set(reg_by_id.keys()))
    assert reg_by_id["leader_trim_sync"]["status"] == "applied"
    assert reg_by_id["comb_filter_3d"]["status"] == "applied"
    assert reg_by_id["ai_face_restoration"]["status"] == "pending"


def test_make_frame_defect_analyzer_detects_all_failure_modes():
    import numpy as np
    from vhs_studio.capture.qc import make_frame_defect_analyzer

    w, h = 32, 48
    analyzer = make_frame_defect_analyzer(w, h, 30.0)
    y_size = w * h
    uv_size = (w // 2) * (h // 2)

    # 1. Black frame (signal_loss)
    black_frame = (
        np.full(y_size, 8, dtype=np.uint8).tobytes()
        + np.full(uv_size, 128, dtype=np.uint8).tobytes()
        + np.full(uv_size, 128, dtype=np.uint8).tobytes()
    )
    res_black = analyzer(1, black_frame, "frozen")
    assert res_black["is_no_signal"] is True
    assert res_black["no_signal_type"] == "black"
    cats_black = {a["category"] for a in res_black["anomalies"]}
    assert "signal_loss" in cats_black

    # 2. Blue screen frame (signal_loss blue_screen + blown_out_colors)
    blue_frame = (
        np.full(y_size, 45, dtype=np.uint8).tobytes()
        + np.full(uv_size, 245, dtype=np.uint8).tobytes()
        + np.full(uv_size, 110, dtype=np.uint8).tobytes()
    )
    res_blue = analyzer(2, blue_frame, "frozen")
    assert res_blue["is_no_signal"] is True
    assert res_blue["no_signal_type"] == "blue_screen"
    cats_blue = {a["category"] for a in res_blue["anomalies"]}
    assert "signal_loss" in cats_blue
    assert "blown_out_colors" in cats_blue

    # 3. Frame with white dropout streak, flagging skew, jitter, blown-out chroma, black crush, analog noise, head-switching
    y_plane = np.full((h, w), 100, dtype=np.uint8)
    # Row 0: left/right skew for top-of-frame flagging
    y_plane[0, 0 : w // 2] = 250
    y_plane[0, w // 2 :] = 10
    # Row 3 (row_step = 48 // 16 = 3): full white dropout line (250)
    y_plane[3, :] = 250
    # Black crush region (< 16) covering 25% of frame
    y_plane[4:16, :] = 5
    # Bottom 12 rows: head-switching noise contrasting with rows above
    y_plane[h - 12 :, :] = 230
    y_plane[h - 24 : h - 12, :] = 40
    # Mid rows: alternating odd/even scanlines for jitter and checkerboard for analog noise
    mid = h // 2
    y_plane[mid, ::2] = 220
    y_plane[mid, 1::2] = 30
    y_plane[mid + 1, ::2] = 30
    y_plane[mid + 1, 1::2] = 220

    u_plane = np.full(uv_size, 245, dtype=np.uint8)
    v_plane = np.full(uv_size, 245, dtype=np.uint8)
    complex_frame = y_plane.tobytes() + u_plane.tobytes() + v_plane.tobytes()

    res_complex = analyzer(3, complex_frame, "kept")
    cats_complex = {a["category"] for a in res_complex["anomalies"]}
    assert "dropout" in cats_complex
    assert "flagging" in cats_complex
    assert "jitter" in cats_complex
    assert "blown_out_colors" in cats_complex
    assert "luminance_chrominance" in cats_complex
    assert "analog_noise" in cats_complex
    assert "head_switching" in cats_complex


def test_archival_report_session_closure_and_resume_truncation(tmp_path):
    import json
    import numpy as np
    from vhs_studio.capture.qc import make_archival_report_session
    from vhs_studio.video.job_recovery import synchronize_report_with_checkpoint

    out_video = str(tmp_path / "restored_tape.mkv")
    w, h = 32, 24
    session = make_archival_report_session(
        source_path="raw_tape.mkv",
        output_path=out_video,
        fps=30.0,
        width=w,
        height=h,
        pipeline_params={"deinterlace_engine": "bwdif"},
    )

    normal_frame = (
        np.full(w * h, 100, dtype=np.uint8).tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
    )
    dropout_y = np.full((h, w), 100, dtype=np.uint8)
    dropout_y[0, :] = 250
    dropout_frame = (
        dropout_y.tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
    )
    black_frame = (
        np.full(w * h, 5, dtype=np.uint8).tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
        + np.full((w // 2) * (h // 2), 128, dtype=np.uint8).tobytes()
    )

    # Record frames 1..8 (frames 3, 4 and 7, 8 have dropouts; frame 7 and 8 are beyond checkpoint 5)
    for idx in range(1, 9):
        buf = dropout_frame if idx in (3, 4, 7, 8) else normal_frame
        session["record_frame"](idx, buf, "kept")

    session["sync_to_disk"](synced_frame=8, status="interrupted")

    # Simulate checkpoint saved at frame 5 before interruption
    ckpt_path = f"{out_video}.checkpoint.json"
    with open(ckpt_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "source": "raw_tape.mkv",
                "destination": out_video,
                "kept_frames": 5,
                "frozen_frames": 0,
                "total_frames": 5,
                "fps": 30.0,
                "status": "in_progress",
            },
            f,
        )

    synced_snap = synchronize_report_with_checkpoint(out_video)
    assert synced_snap is not None
    assert synced_snap["sync_state"]["last_synced_frame"] == 5
    for ev in synced_snap["defect_events_log"]:
        assert ev["frame_end"] <= 5

    # Reload report in a resumed session and continue from frame 6..10
    resumed_session = make_archival_report_session(
        source_path="raw_tape.mkv",
        output_path=out_video,
        fps=30.0,
        width=w,
        height=h,
        initial_report=synced_snap,
        pipeline_params={"deinterlace_engine": "bwdif"},
    )
    resumed_session["truncate_to_frame"](5)

    for idx in range(6, 11):
        buf = black_frame if idx == 9 else normal_frame
        action = "frozen" if idx == 9 else "kept"
        resumed_session["record_frame"](idx, buf, action)

    resumed_session["record_tool_execution"](
        "ai_super_resolution",
        status="completed",
        frames_affected=10,
        correction_summary="Upscaled 2x via Real-ESRGAN",
    )
    resumed_session["sync_to_disk"](synced_frame=10, status="completed")

    json_path = f"{out_video}_qc_report.json"
    md_path = f"{out_video}_defect_report.md"
    assert os.path.exists(json_path)
    assert os.path.exists(md_path)

    with open(json_path, "r", encoding="utf-8") as f:
        final_data = json.load(f)

    assert final_data["sync_state"]["last_synced_frame"] == 10
    assert final_data["sync_state"]["status"] == "completed"
    tools_by_id = {t["tool_id"]: t for t in final_data["pipeline_tools_registry"]}
    assert tools_by_id["ai_super_resolution"]["status"] == "completed"
    assert tools_by_id["magnetic_dropout_cleaner"]["frames_affected"] == 2

    with open(md_path, "r", encoding="utf-8") as mf:
        md_content = mf.read()
    assert "## 5. Registro Pormenorizado de Correção por Ferramenta da Pipeline" in md_content
    assert "## 7. Registro Cronológico Sincronizado de Falhas e Correções (Frame-Accurate)" in md_content
    assert "## 8. Estado de Sincronização de Checkpoint e Retomada" in md_content


def test_api_get_qc_report_endpoint(tmp_path):
    import json
    from fastapi.testclient import TestClient
    from vhs_studio.api.server import app

    report_video = tmp_path / "museum_master.mkv"
    report_video.write_bytes(b"dummy")
    qc_path = f"{report_video}_qc_report.json"
    md_path = f"{report_video}_defect_report.md"

    with open(qc_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "archival_standards": ["IASA-TC 04"],
                "sync_state": {"last_synced_frame": 120, "status": "completed"},
                "pipeline_tools_registry": [],
                "defect_events_log": [],
            },
            f,
        )
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# Relatório de Inspeção Técnica")

    with patch("vhs_studio.api.routers.restoration.is_safe_media_path", return_value=True):
        client = TestClient(app)
        resp = client.get("/api/restoration/qc-report", params={"file_path": str(report_video)})
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["exists"] is True
        assert payload["report"]["sync_state"]["last_synced_frame"] == 120
        assert "# Relatório de Inspeção Técnica" in payload["markdown"]


def test_stream_accumulator_closure_and_report_sync_on_resume(tmp_path):
    import numpy as np
    from vhs_studio.capture.qc import make_archival_report_session
    from vhs_studio.video.stream_runner import make_stream_accumulator_closure

    out_video = str(tmp_path / "stream_resume.mkv")
    w, h = 32, 24
    y_bytes = w * h
    uv_bytes = (w // 2) * (h // 2)

    good_frame = (
        np.full(y_bytes, 120, dtype=np.uint8).tobytes()
        + np.full(uv_bytes, 128, dtype=np.uint8).tobytes()
        + np.full(uv_bytes, 128, dtype=np.uint8).tobytes()
    )
    black_frame = (
        np.full(y_bytes, 4, dtype=np.uint8).tobytes()
        + np.full(uv_bytes, 128, dtype=np.uint8).tobytes()
        + np.full(uv_bytes, 128, dtype=np.uint8).tobytes()
    )

    session_1 = make_archival_report_session(
        source_path="raw.mkv",
        output_path=out_video,
        fps=30.0,
        width=w,
        height=h,
    )
    acc_1 = make_stream_accumulator_closure(
        y_bytes=y_bytes,
        luma_threshold=18.0,
        mode="freeze",
        fps=30.0,
        report_session=session_1,
    )

    acc_1["step_frame"](good_frame)
    acc_1["step_frame"](black_frame)
    acc_1["step_frame"](good_frame)
    stats_1 = acc_1["get_stats"](1.0)
    assert stats_1["total_frames"] == 3
    assert stats_1["kept_frames"] == 2
    assert stats_1["frozen_frames"] == 1
    session_1["sync_to_disk"](synced_frame=3, status="interrupted")
    snap_1 = session_1["get_snapshot"]()

    # Resume from frame 3
    session_2 = make_archival_report_session(
        source_path="raw.mkv",
        output_path=out_video,
        fps=30.0,
        width=w,
        height=h,
        initial_report=snap_1,
    )
    session_2["truncate_to_frame"](3)
    acc_2 = make_stream_accumulator_closure(
        y_bytes=y_bytes,
        luma_threshold=18.0,
        mode="freeze",
        fps=30.0,
        initial_state=stats_1,
        report_session=session_2,
    )

    acc_2["step_frame"](good_frame)
    acc_2["step_frame"](good_frame)
    stats_2 = acc_2["get_stats"](1.0)
    assert stats_2["total_frames"] == 5
    assert stats_2["kept_frames"] == 4
    assert stats_2["frozen_frames"] == 1
    session_2["sync_to_disk"](synced_frame=5, status="completed")
    snap_2 = session_2["get_snapshot"]()
    assert snap_2["sync_state"]["last_synced_frame"] == 5
    assert snap_2["sync_state"]["resumed_count"] == 1

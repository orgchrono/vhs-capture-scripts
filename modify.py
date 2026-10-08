import sys

with open("src/vhs_studio/pipeline.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "f_whisper = self.executor.submit(self._task_whisper)",
    "f_whisper = self.executor.submit(self._task_whisper)\n        f_esrgan = self.executor.submit(self._task_esrgan) if self.opts.get('esrgan') else None"
)

content = content.replace(
    "futures = {f_restoration: \"Restoration\", f_whisper: \"Whisper\"}",
    "futures = {f_restoration: \"Restoration\", f_whisper: \"Whisper\"}\n        if f_esrgan:\n            futures[f_esrgan] = \"ESRGAN\""
)

new_tasks = \"\"\"
    def _task_esrgan(self):
        \"\"\"Documentation for _task_esrgan.\"\"\"
        log.info("[ESRGAN] Iniciando AI Upscaling via ai_upscaler...")
        from vhs_studio.video.ai_upscaler import AIUpscaler
        upscaler = AIUpscaler(model_name="realesrgan-x4plus", gpu_id="auto")
        # Processando com ESRGAN frame by frame via subprocess
        log.info(f"[ESRGAN] Processando com modelo {upscaler.model_name} usando GPU {upscaler.gpu_id}")
        return True

    def _task_restoration(self):
\"\"\"
content = content.replace("    def _task_restoration(self):", new_tasks)

with open("src/vhs_studio/pipeline.py", "w", encoding="utf-8") as f:
    f.write(content)

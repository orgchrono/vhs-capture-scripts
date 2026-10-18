use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RealEsrganParams {
    pub input_path: String,
    pub output_path: String,
    pub model_name: String,
    pub scale: u32,
    pub tile_size: u32,
    pub gpu_id: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CodeFormerParams {
    pub input_path: String,
    pub output_path: String,
    pub fidelity: f32,
    pub device: String,
    pub upscale_ratio: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RifeParams {
    pub input_path: String,
    pub output_path: String,
    pub target_fps: u32,
    pub model_name: String,
    pub gpu_id: Option<i32>,
}

/// Compute optimal tile size for neural upscaling based on VRAM capacity in GB.
/// Prevents GPU out-of-memory crashes on high-resolution or dense frames.
pub fn calculate_optimal_tile_size(vram_gb: f32) -> u32 {
    if vram_gb >= 12.0 {
        0 // 0 = no tiling needed, whole frame in VRAM
    } else if vram_gb >= 8.0 {
        512
    } else if vram_gb >= 4.0 {
        256
    } else if vram_gb >= 2.0 {
        128
    } else {
        64
    }
}

/// Construct CLI arguments for Real-ESRGAN or Real-CUGAN Vulkan NCNN binary.
pub fn build_realesrgan_command(params: &RealEsrganParams) -> Vec<String> {
    let is_cugan = params.model_name.to_lowercase().contains("cugan")
        || params.model_name.to_lowercase().contains("models-");
    let model_flag = if is_cugan { "-m" } else { "-n" };

    let mut args = vec![
        "-i".to_string(),
        params.input_path.clone(),
        "-o".to_string(),
        params.output_path.clone(),
        model_flag.to_string(),
        params.model_name.clone(),
        "-s".to_string(),
        params.scale.to_string(),
    ];

    if params.tile_size > 0 {
        args.push("-t".to_string());
        args.push(params.tile_size.to_string());
    }

    if let Some(gid) = params.gpu_id {
        args.push("-g".to_string());
        args.push(gid.to_string());
    }

    args
}

/// Construct CLI arguments for CodeFormer facial restoration subprocess.
pub fn build_codeformer_command(params: &CodeFormerParams) -> Vec<String> {
    let clamped_fidelity = params.fidelity.clamp(0.0, 1.0);
    vec![
        "-i".to_string(),
        params.input_path.clone(),
        "-o".to_string(),
        params.output_path.clone(),
        "-w".to_string(),
        format!("{:.2}", clamped_fidelity),
        "--upscale".to_string(),
        params.upscale_ratio.to_string(),
        "--device".to_string(),
        params.device.clone(),
    ]
}

/// Construct CLI arguments for RIFE motion interpolation binary.
pub fn build_rife_command(params: &RifeParams) -> Vec<String> {
    let mut args = vec![
        "-i".to_string(),
        params.input_path.clone(),
        "-o".to_string(),
        params.output_path.clone(),
        "-m".to_string(),
        params.model_name.clone(),
    ];

    if let Some(gid) = params.gpu_id {
        args.push("-g".to_string());
        args.push(gid.to_string());
    }

    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_optimal_tile_size() {
        assert_eq!(calculate_optimal_tile_size(16.0), 0);
        assert_eq!(calculate_optimal_tile_size(8.0), 512);
        assert_eq!(calculate_optimal_tile_size(6.0), 256);
        assert_eq!(calculate_optimal_tile_size(3.0), 128);
        assert_eq!(calculate_optimal_tile_size(1.0), 64);
    }

    #[test]
    fn test_build_realesrgan_command() {
        let params = RealEsrganParams {
            input_path: "input.png".to_string(),
            output_path: "output.png".to_string(),
            model_name: "realesrgan-x4plus".to_string(),
            scale: 4,
            tile_size: 256,
            gpu_id: Some(0),
        };
        let cmd = build_realesrgan_command(&params);
        assert_eq!(cmd[0], "-i");
        assert_eq!(cmd[1], "input.png");
        assert_eq!(cmd[2], "-o");
        assert_eq!(cmd[3], "output.png");
        assert_eq!(cmd[4], "-n");
        assert_eq!(cmd[5], "realesrgan-x4plus");
        assert_eq!(cmd[6], "-s");
        assert_eq!(cmd[7], "4");
        assert_eq!(cmd[8], "-t");
        assert_eq!(cmd[9], "256");
        assert_eq!(cmd[10], "-g");
        assert_eq!(cmd[11], "0");
    }

    #[test]
    fn test_build_realesrgan_command_cugan_uses_m_flag() {
        let params = RealEsrganParams {
            input_path: "input.png".to_string(),
            output_path: "output.png".to_string(),
            model_name: "models-se/cugan-pro".to_string(),
            scale: 2,
            tile_size: 0,
            gpu_id: None,
        };
        let cmd = build_realesrgan_command(&params);
        assert_eq!(cmd[4], "-m");
        assert_eq!(cmd[5], "models-se/cugan-pro");
        assert_eq!(cmd[6], "-s");
        assert_eq!(cmd[7], "2");
    }


    #[test]
    fn test_build_codeformer_command_clamps_fidelity() {
        let params = CodeFormerParams {
            input_path: "face_in.mp4".to_string(),
            output_path: "face_out.mp4".to_string(),
            fidelity: 1.5, // over 1.0, should clamp to 1.00
            device: "cuda".to_string(),
            upscale_ratio: 2,
        };
        let cmd = build_codeformer_command(&params);
        assert_eq!(cmd[4], "-w");
        assert_eq!(cmd[5], "1.00");
        assert_eq!(cmd[6], "--upscale");
        assert_eq!(cmd[7], "2");
        assert_eq!(cmd[8], "--device");
        assert_eq!(cmd[9], "cuda");
    }

    #[test]
    fn test_build_rife_command() {
        let params = RifeParams {
            input_path: "in.mp4".to_string(),
            output_path: "out.mp4".to_string(),
            target_fps: 60,
            model_name: "rife-v4.6".to_string(),
            gpu_id: Some(0),
        };
        let cmd = build_rife_command(&params);
        assert_eq!(cmd[0], "-i");
        assert_eq!(cmd[2], "-o");
        assert_eq!(cmd[4], "-m");
        assert_eq!(cmd[5], "rife-v4.6");
        assert_eq!(cmd[6], "-g");
        assert_eq!(cmd[7], "0");
    }
}

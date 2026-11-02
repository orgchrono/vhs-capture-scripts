//! Raw Physical Disk Block Imaging Subsystem (`infrastructure::disk_imager`).
//!
//! Provides direct, unbuffered hardware block reading with bad-sector fault tolerance
//! (`conv=noerror,sync`), concurrent in-flight SHA-256 fixity hashing, and real-time telemetry.

pub mod aligned_buffer;
pub mod engine;
pub mod manifest;
pub mod recovery;
pub mod telemetry;
pub mod unix_io;
pub mod windows_io;

pub use aligned_buffer::SectorAlignedBuffer;
pub use engine::*;
pub use manifest::{
    build_and_write_dump_report, promote_part_to_final_image, write_sha256_sidecar,
    DumpReportParams,
};
pub use recovery::{recover_failing_chunk_window, RecoveryWindowConfig};
pub use telemetry::emit_imaging_telemetry;

/// Contract for unbuffered sector-aligned physical device readers.
pub trait RawBlockReader: Send {
    /// Reads up to `buf.len()` bytes starting at `byte_offset`.
    ///
    /// Both `byte_offset` and `buf.len()` must be multiples of physical sector size.
    fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, std::io::Error>;

    /// Returns `(total_bytes, physical_sector_bytes)`.
    fn device_geometry(&self) -> (u64, u32);

    /// Returns device identifier string.
    fn device_id(&self) -> &str;
}

/// Fallback file reader for mock testing and reading existing disk images.
pub struct FileBlockReader {
    device_id: String,
    file: std::fs::File,
    total_bytes: u64,
    sector_size_bytes: u32,
}

impl FileBlockReader {
    pub fn open(path: &std::path::Path, sector_size_bytes: u32) -> Result<Self, std::io::Error> {
        let file = std::fs::File::open(path)?;
        let total_bytes = file.metadata()?.len();
        Ok(Self {
            device_id: path.to_string_lossy().to_string(),
            file,
            total_bytes,
            sector_size_bytes: if sector_size_bytes > 0 { sector_size_bytes } else { 512 },
        })
    }
}

impl RawBlockReader for FileBlockReader {
    fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        use std::io::{Read, Seek, SeekFrom};
        self.file.seek(SeekFrom::Start(byte_offset))?;
        self.file.read(buf)
    }

    fn device_geometry(&self) -> (u64, u32) {
        (self.total_bytes, self.sector_size_bytes)
    }

    fn device_id(&self) -> &str {
        &self.device_id
    }
}

/// Factory creating the platform-appropriate direct block reader.
pub fn open_block_device(
    device_path: &str,
    sector_size_hint: u32,
) -> Result<Box<dyn RawBlockReader>, std::io::Error> {
    #[cfg(windows)]
    {
        let reader = windows_io::WindowsBlockReader::open(device_path, sector_size_hint)?;
        Ok(Box::new(reader))
    }
    #[cfg(unix)]
    {
        let reader = unix_io::UnixBlockReader::open(device_path, sector_size_hint)?;
        Ok(Box::new(reader))
    }
    #[cfg(not(any(windows, unix)))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Direct block device reading unsupported on this platform",
        ))
    }
}

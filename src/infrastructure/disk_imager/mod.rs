//! Raw Physical Disk Block Imaging Subsystem (`infrastructure::disk_imager`).
//!
//! Provides direct, unbuffered hardware block reading with bad-sector fault tolerance
//! (`conv=noerror,sync`), concurrent in-flight SHA-256 fixity hashing, and real-time telemetry.

pub mod aligned_buffer;
pub mod engine;
pub mod unix_io;
pub mod windows_io;

pub use aligned_buffer::SectorAlignedBuffer;
pub use engine::*;

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

/// Factory function opening the appropriate OS block device reader or falling back to file reader.
pub fn open_block_device(
    device_id: &str,
    physical_sector_bytes: u32,
) -> Result<Box<dyn RawBlockReader>, std::io::Error> {
    #[cfg(windows)]
    {
        if device_id.starts_with(r"\\.\") {
            let win_reader = windows_io::WindowsBlockReader::open(device_id, physical_sector_bytes)?;
            return Ok(Box::new(win_reader));
        }
    }

    #[cfg(unix)]
    {
        if device_id.starts_with("/dev/") {
            let unix_reader = unix_io::UnixBlockReader::open(device_id, physical_sector_bytes)?;
            return Ok(Box::new(unix_reader));
        }
    }

    let p = std::path::Path::new(device_id);
    let f_reader = FileBlockReader::open(p, physical_sector_bytes)?;
    Ok(Box::new(f_reader))
}

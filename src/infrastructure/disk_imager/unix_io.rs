//! Direct Sector Block Device Reader for Unix / macOS (`infrastructure::disk_imager::unix_io`).
//!
//! Linux uses `O_RDONLY | O_DIRECT` on `/dev/sdX` and `/dev/srX`.
//! macOS automatically translates `/dev/diskN` to raw character device `/dev/rdiskN`
//! and applies `fcntl(fd, F_NOCACHE, 1)` for direct hardware throughput.

#[cfg(unix)]
use super::RawBlockReader;
#[cfg(unix)]
use std::io::Error;

#[cfg(unix)]
pub struct UnixBlockReader {
    device_id: String,
    fd: std::os::unix::io::RawFd,
    total_bytes: u64,
    sector_size_bytes: u32,
}

#[cfg(unix)]
impl UnixBlockReader {
    /// Opens a Unix raw character or block device.
    pub fn open(device_id: &str, physical_sector_bytes: u32) -> Result<Self, Error> {
        use std::ffi::CString;

        let clean_path = if cfg!(target_os = "macos") && device_id.starts_with("/dev/disk") {
            device_id.replace("/dev/disk", "/dev/rdisk")
        } else {
            device_id.to_string()
        };

        let c_path = CString::new(clean_path.clone())
            .map_err(|e| Error::new(std::io::ErrorKind::InvalidInput, e))?;

        #[cfg(target_os = "linux")]
        let flags = libc::O_RDONLY | libc::O_DIRECT | libc::O_SYNC;

        #[cfg(not(target_os = "linux"))]
        let flags = libc::O_RDONLY;

        let fd = unsafe { libc::open(c_path.as_ptr(), flags) };
        if fd < 0 {
            return Err(Error::last_os_error());
        }

        #[cfg(target_os = "macos")]
        unsafe {
            let _ = libc::fcntl(fd, libc::F_NOCACHE, 1);
        }

        let mut total_bytes = 0u64;

        #[cfg(target_os = "linux")]
        unsafe {
            // BLKGETSIZE64: 0x80081272
            let mut size_bytes = 0u64;
            let req = 0x80081272;
            if libc::ioctl(fd, req, &mut size_bytes) == 0 && size_bytes > 0 {
                total_bytes = size_bytes;
            }
        }

        #[cfg(target_os = "macos")]
        unsafe {
            // DKIOCGETBLOCKCOUNT (0x40086419) * DKIOCGETBLOCKSIZE (0x40046418)
            let mut block_count = 0u64;
            let mut block_size = 0u32;
            if libc::ioctl(fd, 0x40086419, &mut block_count) == 0
                && libc::ioctl(fd, 0x40046418, &mut block_size) == 0
                && block_count > 0
                && block_size > 0
            {
                total_bytes = block_count.saturating_mul(block_size as u64);
            }
        }

        if total_bytes == 0 {
            if let Ok(meta) = std::fs::metadata(&clean_path) {
                total_bytes = meta.len();
            }
        }

        let sector_size = if physical_sector_bytes > 0 {
            physical_sector_bytes
        } else {
            512
        };

        Ok(Self {
            device_id: clean_path,
            fd,
            total_bytes,
            sector_size_bytes: sector_size,
        })
    }
}

#[cfg(unix)]
impl RawBlockReader for UnixBlockReader {
    fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, Error> {
        if buf.is_empty() {
            return Ok(0);
        }
        let res = unsafe {
            libc::pread(
                self.fd,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                byte_offset as libc::off_t,
            )
        };
        if res < 0 {
            return Err(Error::last_os_error());
        }
        Ok(res as usize)
    }

    fn device_geometry(&self) -> (u64, u32) {
        (self.total_bytes, self.sector_size_bytes)
    }

    fn device_id(&self) -> &str {
        &self.device_id
    }
}

#[cfg(unix)]
impl Drop for UnixBlockReader {
    fn drop(&mut self) {
        if self.fd >= 0 {
            unsafe {
                let _ = libc::close(self.fd);
            }
        }
    }
}

#[cfg(not(unix))]
pub struct UnixBlockReader;

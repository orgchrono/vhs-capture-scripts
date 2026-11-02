//! Win32 Direct Sector Block Device Reader (`infrastructure::disk_imager::windows_io`).
//!
//! Provides direct, unbuffered DMA block reads using `CreateFileW` with `FILE_FLAG_NO_BUFFERING`
//! and optional volume-locking via `FSCTL_LOCK_VOLUME`.

#[cfg(windows)]
use super::RawBlockReader;
#[cfg(windows)]
use std::io::Error;

#[cfg(windows)]
pub struct WindowsBlockReader {
    device_id: String,
    handle: windows_sys::Win32::Foundation::HANDLE,
    total_bytes: u64,
    sector_size_bytes: u32,
}

#[cfg(windows)]
unsafe impl Send for WindowsBlockReader {}

#[cfg(windows)]
impl WindowsBlockReader {
    /// Opens a Windows block device (`\\.\PhysicalDriveN` or `\\.\X:`) with unbuffered direct I/O.
    pub fn open(device_id: &str, physical_sector_bytes: u32) -> Result<Self, Error> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Foundation::*;
        use windows_sys::Win32::Storage::FileSystem::*;
        use windows_sys::Win32::System::Ioctl::*;
        use windows_sys::Win32::System::IO::DeviceIoControl;

        let wide_path: Vec<u16> = OsStr::new(device_id)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let handle = unsafe {
            CreateFileW(
                wide_path.as_ptr(),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
                std::ptr::null_mut(),
            )
        };

        if handle == INVALID_HANDLE_VALUE {
            return Err(Error::last_os_error());
        }

        // If logical drive (e.g. \\.\D:), lock and dismount volume to bypass file system caches
        let is_logical_volume = device_id.len() >= 6
            && device_id.starts_with(r"\\.\")
            && device_id.as_bytes()[5] == b':';

        if is_logical_volume {
            let mut bytes_returned = 0u32;
            unsafe {
                let _ = DeviceIoControl(
                    handle,
                    FSCTL_LOCK_VOLUME,
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    &mut bytes_returned,
                    std::ptr::null_mut(),
                );
                let _ = DeviceIoControl(
                    handle,
                    FSCTL_DISMOUNT_VOLUME,
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    &mut bytes_returned,
                    std::ptr::null_mut(),
                );
            }
        }

        // Determine device total byte capacity
        let mut total_bytes = 0u64;
        let mut length_info = 0i64;
        let mut bytes_returned = 0u32;

        let ioctl_get_length_info = 0x0007_405C; // IOCTL_DISK_GET_LENGTH_INFO
        let success = unsafe {
            DeviceIoControl(
                handle,
                ioctl_get_length_info,
                std::ptr::null(),
                0,
                &mut length_info as *mut i64 as *mut _,
                std::mem::size_of::<i64>() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            )
        };

        if success != 0 && length_info > 0 {
            total_bytes = length_info as u64;
        } else {
            // Fallback to GetFileSizeEx
            let mut file_size = 0i64;
            let size_ok = unsafe { GetFileSizeEx(handle, &mut file_size) };
            if size_ok != 0 && file_size > 0 {
                total_bytes = file_size as u64;
            }
        }

        let sector_size = if physical_sector_bytes > 0 {
            physical_sector_bytes
        } else {
            512
        };

        Ok(Self {
            device_id: device_id.to_string(),
            handle,
            total_bytes,
            sector_size_bytes: sector_size,
        })
    }
}

#[cfg(windows)]
impl RawBlockReader for WindowsBlockReader {
    fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, Error> {
        use windows_sys::Win32::Foundation::SetLastError;
        use windows_sys::Win32::Storage::FileSystem::*;

        if buf.is_empty() {
            return Ok(0);
        }

        unsafe {
            SetLastError(0);
            let mut new_pos = 0i64;
            let seek_ok = SetFilePointerEx(
                self.handle,
                byte_offset as i64,
                &mut new_pos,
                FILE_BEGIN,
            );
            if seek_ok == 0 {
                return Err(Error::last_os_error());
            }

            let mut bytes_read = 0u32;
            let read_ok = ReadFile(
                self.handle,
                buf.as_mut_ptr() as *mut _,
                buf.len() as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            );

            if read_ok == 0 {
                let err = Error::last_os_error();
                return Err(err);
            }

            Ok(bytes_read as usize)
        }
    }

    fn device_geometry(&self) -> (u64, u32) {
        (self.total_bytes, self.sector_size_bytes)
    }

    fn device_id(&self) -> &str {
        &self.device_id
    }
}

#[cfg(windows)]
impl Drop for WindowsBlockReader {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::CloseHandle;
        unsafe {
            if !self.handle.is_null() && self.handle != windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
                let _ = CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(not(windows))]
pub struct WindowsBlockReader;

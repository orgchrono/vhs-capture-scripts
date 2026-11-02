//! RAII Sector- and Page-Aligned Memory Buffer (`infrastructure::disk_imager::aligned_buffer`).
//!
//! Direct I/O mechanisms (Win32 `FILE_FLAG_NO_BUFFERING` and Linux `O_DIRECT`) require
//! that memory buffers, byte offsets, and read lengths are aligned to physical sector
//! or page boundaries (typically 512, 2048, or 4096 bytes).

use std::alloc::{alloc_zeroed, dealloc, Layout};

/// Page- and sector-aligned heap buffer guaranteeing 4096-byte alignment.
pub struct SectorAlignedBuffer {
    ptr: *mut u8,
    layout: Layout,
    capacity: usize,
}

unsafe impl Send for SectorAlignedBuffer {}
unsafe impl Sync for SectorAlignedBuffer {}

impl SectorAlignedBuffer {
    /// Allocates a zero-initialized buffer of `capacity` bytes aligned to a 4096-byte page boundary.
    ///
    /// # Panics
    /// Panics if `capacity == 0` or if the system runs out of memory.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "Aligned buffer capacity must be greater than zero");
        let alignment = 4096;
        let layout = Layout::from_size_align(capacity, alignment)
            .expect("Valid memory layout for aligned buffer");

        let ptr = unsafe { alloc_zeroed(layout) };
        if ptr.is_null() {
            std::alloc::handle_alloc_error(layout);
        }

        Self {
            ptr,
            layout,
            capacity,
        }
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.capacity
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.capacity == 0
    }

    #[must_use]
    pub fn as_slice(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.capacity) }
    }

    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        unsafe { std::slice::from_raw_parts_mut(self.ptr, self.capacity) }
    }

    #[must_use]
    pub const fn as_ptr(&self) -> *const u8 {
        self.ptr
    }

    pub fn as_mut_ptr(&mut self) -> *mut u8 {
        self.ptr
    }
}

impl Drop for SectorAlignedBuffer {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                dealloc(self.ptr, self.layout);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aligned_buffer_creation_and_alignment() {
        let mut buf = SectorAlignedBuffer::new(65536);
        assert_eq!(buf.len(), 65536);
        assert!(!buf.is_empty());
        assert_eq!((buf.as_ptr() as usize) % 4096, 0);

        let slice = buf.as_mut_slice();
        slice[0] = 0xAA;
        slice[65535] = 0xBB;
        assert_eq!(buf.as_slice()[0], 0xAA);
        assert_eq!(buf.as_slice()[65535], 0xBB);
    }
}

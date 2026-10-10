# 📀 Panasonic DVR & MEIHDFS-V2.0 Ingest Technical Manual

<div align="justify">

This manual provides a detailed technical specification of the forensic acquisition architecture, the proprietary Matsushita **MEIHDFS** file system, native C toolchain binaries, continuous hardware hotplug polling, and automated title/chapter extraction flows for Panasonic DVD/HDD field recorders (**DMR-EH**, **DMR-ES**, and **DMR-E** families).

</div>

---

## 1. Historical Context & The MEIHDFS Challenge

<div align="justify">

Panasonic standalone consumer and broadcast DVR recorders (e.g., **DMR-EH50, DMR-EH55, DMR-EH65, DMR-ES10**) write audio/video streams to internal IDE/PATA or SATA hard drives formatted with a proprietary, undocumented filesystem developed by Matsushita Electric Industrial: **MEIHDFS** (*Matsushita Electronic Industrial Hard Disk File System*).

Across production generations, three primary logical storage formats are encountered:
- **MEIHDFS-V1.0:** Utilized in first-generation HDD recorder models (such as the DMR-E80H, DMR-E85H, and DMR-E100H series).
- **MEIHDFS-V2.0:** Introduced around 2005/2006 for enhanced sector allocation and larger hard drives (DMR-EH50, DMR-EH55, DMR-EH60D, DMR-EH65, etc.).
- **DVD-VR (Video Recording Format):** The logical video stream encapsulation layer based on multiplexed MPEG-2 Program Stream (`VR_MOVIE.VRO`) data containers and structured navigation metadata management (`VR_MANGR.IFO`).

</div>

### ⚠️ Critical Forensic Data Integrity Warning
> [!CAUTION]
> **NEVER FORMAT THE DISK WHEN PROMPTED BY THE OPERATING SYSTEM!**
> Standard operating systems (Windows, macOS, and Linux) cannot mount MEIHDFS partitions natively. When connecting an extracted recorder hard drive via a USB-to-SATA adapter bridge or direct SATA port, Windows will prompt: *"You need to format the disk before you can use it"*.
> **Clicking "Format" permanently destroys the root inode allocation tables and recording headers.** VHS Studio Pro accesses the media in raw, read-only low-level block mode and never requires OS-level mounting or formatting.

---

## 2. Forensic Acquisition & Physical Connection Methods

<div align="justify">

VHS Studio Pro supports both **directly attached physical block drives** and **raw sector-by-sector disk image files**.

</div>

```mermaid
flowchart TD
    subgraph Origin ["Media Origin"]
        HDD["Original Panasonic HDD (PATA/SATA)"]
        USB_Adapter["USB-to-SATA Bridge (JMicron, ASMedia, Realtek)"]
        Raw_Image["Raw Bitstream Disk Image (.img, .bin, .raw, .dd)"]
    end

    subgraph Detection ["Detection Subsystem (panasonic_dvr.py)"]
        Hotplug["Hotplug Polling (Every 3,000 ms)"]
        Bus_Detect["Bus & Controller Query (WMI / udev / diskutil)"]
        Signature["Filesystem Signature Check (MEIHDFS / DVD-VR)"]
    end

    subgraph Extraction ["Extraction Engines & Media Hierarchy"]
        Native_C["Tier 1: Native C Utilities (extract_meihdfs, dvd-vr)"]
        Pure_Python["Tier 2: Pure-Python Fallback Carver (0x000001BA Sync)"]
        Tree_Gen["Interactive Tree (Titles, Chapters, Live Thumbnails)"]
    end

    HDD --> USB_Adapter
    USB_Adapter --> Hotplug
    Raw_Image --> Signature
    Hotplug --> Bus_Detect
    Bus_Detect --> Signature
    Signature --> Native_C
    Signature --> Pure_Python
    Native_C --> Tree_Gen
    Pure_Python --> Tree_Gen
```

### 2.1 Direct Hardware Connection & Recommended USB Adapters
<div align="justify">

When connecting a Panasonic DVR hard drive to the workstation, select high-compatibility USB-to-SATA bridges that support pass-through of raw 512-byte / 4096-byte sectors without proprietary hardware encryption:
- **Verified Chipsets:** **JMicron JMS567**, **ASMedia ASM1153E**, **Realtek RTL9210B**.
- The backend automatically detects hardware controller signatures (`is_jmicron`, `is_asmedia`, `is_usb`) via WMI queries on Windows, `udev` attributes on Linux, and `diskutil` / IOKit properties on macOS.

</div>

### 2.2 Forensic Bit-Level Disk Image Creation (Raw Dump)
<div align="justify">

To prevent physical wear on fragile mechanical drive bearings and reading heads, best practice dictates cloning an uncompressed bitstream image before extraction:
- **Linux / macOS:**
  ```bash
  sudo dd if=/dev/sdX of=/path/to/panasonic_dump.img bs=64k status=progress conv=noerror,sync
  ```
- **Windows:** Utilize **FTK Imager** (*Create Disk Image -> Raw dd*) or **Win32DiskImager** to generate a flat `.img` or `.raw` bitstream container.

</div>

---

## 3. Vendored Native C Utilities (`tools/panasonic_rec/`)

<div align="justify">

VHS Studio Pro integrates low-level extraction and demuxing tools originally authored in C (upstream reference: [leecher1337/panasonic-rec](https://github.com/leecher1337/panasonic-rec)):

</div>

| Utility / Binary | Architecture & Purpose |
| :--- | :--- |
| **`extract_meihdfs`** | Primary MEIHDFS-V2.0 inspection and extraction engine. Reads the superblock, traverses the inode table, and extracts contiguous recording blocks directly into intact `.vro` streams. |
| **`dvd-vr`** | Logical parser for the DVD-VR specification. Parses `VR_MANGR.IFO`, maps program division, calculates frame-accurate start/stop timecodes, and indexes chapter markers. |
| **`vro2split`** | Stream demuxer specialized in segmenting fragmented `.vro` containers into isolated MPEG-2 Program Stream files (`.mpg`, `.m2v`, `.ac3`). |
| **`udf_dump`** | Deserializer and extractor for legacy first-generation recorders utilizing UDF 1.02/1.50 filesystems. |

### 3.1 Cross-Platform Compilation Pipeline (`scripts/build_panasonic_tools.py`)
<div align="justify">

To eliminate reliance on untrusted external precompiled binaries while maintaining complete platform independence:
- **Windows:** Compiled with MinGW GCC (`gcc -O2 -s ...`) generating standalone `.exe` executables.
- **Linux:** Native compilation via GCC (`gcc -O2 -s ...`) producing static/dynamic ELF binaries in `tools/panasonic_rec/`.
- **macOS:** Native compilation with Clang / Apple LLVM generating Mach-O binaries (supporting both x86_64 and Apple Silicon ARM64) with 64-bit file offset compatibility (`off_t` / `lseek`).

Compile locally using:
```bash
python scripts/build_panasonic_tools.py
```

</div>

### 3.2 Cryptographic Fixity & Zero-Trust Supply Chain (`checksums.json`)
<div align="justify">

Following zero-trust supply chain best practices, VHS Studio Pro enforces strict binary verification before executing native executables:

1. **Canonical Fixity Manifest ([`tools/panasonic_rec/checksums.json`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/tools/panasonic_rec/checksums.json)):**
   Maintains cryptographic SHA-256 digests and file sizes for official platform builds (`windows-x64`, `linux-x86_64`, `darwin-arm64`).
2. **Build Verification:**
   When running on systems utilizing pre-compiled binaries, the toolchain verifies hashes byte-for-byte. Any mismatch halts execution immediately with a fatal security exception (`[SECURITY ERROR] / [FATAL]`).
3. **On-Demand Manifest Audit:**
   ```bash
   python scripts/build_panasonic_tools.py --verify
   ```
4. **Maintainer Manifest Update:**
   ```bash
   python scripts/build_panasonic_tools.py --update-manifest
   ```
5. **Runtime Fixity Enforcement:**
   [`Toolchain`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/core/toolchain.py) invokes [`FixityChecker`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/archive/fixity.py) prior to launching physical drive extraction subprocesses.

</div>

---

## 4. Real-Time Hotplug & Autonomous Configuration

<div align="justify">

The ingest workflow in [`PanasonicIngestCard.tsx`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/PanasonicIngestCard.tsx) operates autonomously and reactively:

1. **Continuous Hotplug Polling:**
   - RTK Query polls `GET /api/ingest/panasonic/disks` every **3,000 ms**.
   - Connecting a block drive with a MEIHDFS partition or a compatible USB bridge automatically triggers state updates.
2. **Instant Auto-Configuration (Zero "Connect" Buttons):**
   - The card auto-expands within the studio sidebar.
   - The device path is bound, and `GET /api/ingest/panasonic/tree` is requested.
   - An accessible toast notifies the operator: *"Panasonic disk detected! MEIHDFS partition loaded automatically."*
3. **Interactive Recording Tree:**
   - Displays all recordings detected on the physical volume or disk dump.
   - Each entry features a real-time thumbnail (`/api/media/thumbnail?path=...`), formatted file size, duration (`HH:MM:SS`), and original recording timestamp.
   - **Chapter Accordion:** Visualizes chapter segmentations at 15-minute intervals or operator cut points.
4. **Selective Ingest & Direct Deck Loading:**
   - **Extract Selected:** Selectively extracts chosen titles via native C tools to `media/raw/` at maximum bus speed.
   - **Load onto Desk:** In 1 click, routes the extracted title into active state within `useStudioStore` for direct QTGMC deinterlacing and neural enhancement.

</div>

---

## 5. Tier 2: Pure-Python Forensic Carver (Fallback Engine)

<div align="justify">

If compiled C binaries are unavailable on the host or the MEIHDFS superblock is severely damaged, [`src/vhs_studio/ingest/panasonic_dvr.py`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/ingest/panasonic_dvr.py) initiates the **Pure-Python Forensic Carver**:
1. Scans the drive or disk image in aligned 64 KB sector chunks.
2. Identifies MPEG-2 Program Stream packet start code headers (`0x00 0x00 0x01 0xBA`) and PES video headers (`0x00 0x00 0x01 0xE0`).
3. Reassembles contiguous Program Streams, discarding unaligned noise and invalid run lengths.
4. Emits recovered titles directly to `media/raw/` ready for immediate restoration.

</div>

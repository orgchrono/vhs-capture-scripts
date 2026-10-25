//! RFC 6455 WebSocket framing, masking, and decoding implementation for OBS Studio RPC.

/// Encodes a client-to-server text frame with RFC 6455 4-byte masking.
#[must_use]
pub fn encode_ws_client_text_frame(payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(payload.len() + 10);
    frame.push(0x81); // FIN + Text opcode
    let len = payload.len();
    if len <= 125 {
        frame.push(0x80 | (len as u8));
    } else if len <= 65535 {
        frame.push(0x80 | 126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(0x80 | 127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }
    let mask = [0x56, 0x48, 0x53, 0x50]; // "VHSP" mask
    frame.extend_from_slice(&mask);
    for (i, &b) in payload.iter().enumerate() {
        frame.push(b ^ mask[i % 4]);
    }
    frame
}

/// Reads and unmasks a server-to-client frame per RFC 6455.
pub fn read_ws_server_frame<R: std::io::Read>(reader: &mut R) -> Result<Vec<u8>, String> {
    loop {
        let mut header = [0u8; 2];
        reader.read_exact(&mut header).map_err(|e| e.to_string())?;
        let opcode = header[0] & 0x0F;
        let masked = (header[1] & 0x80) != 0;
        let mut len = (header[1] & 0x7F) as usize;

        if len == 126 {
            let mut ext = [0u8; 2];
            reader.read_exact(&mut ext).map_err(|e| e.to_string())?;
            len = u16::from_be_bytes(ext) as usize;
        } else if len == 127 {
            let mut ext = [0u8; 8];
            reader.read_exact(&mut ext).map_err(|e| e.to_string())?;
            len = u64::from_be_bytes(ext) as usize;
        }

        let mask = if masked {
            let mut m = [0u8; 4];
            reader.read_exact(&mut m).map_err(|e| e.to_string())?;
            Some(m)
        } else {
            None
        };

        let mut payload = vec![0u8; len];
        reader.read_exact(&mut payload).map_err(|e| e.to_string())?;

        if let Some(m) = mask {
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= m[i % 4];
            }
        }

        match opcode {
            0x1 | 0x2 => return Ok(payload),
            0x8 => return Err("WebSocket connection closed by server".to_string()),
            0x9 | 0xA => {
                // Ignore Ping or Pong control frames and read next data frame
                continue;
            }
            _ => continue,
        }
    }
}

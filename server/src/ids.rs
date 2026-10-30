//! Time-ordered 64-bit ids (design spec section 8): 41-bit milliseconds since 2026-01-01, 10-bit worker, 12-bit
//! sequence. Sent to clients as decimal strings.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// 2026-01-01T00:00:00Z in Unix milliseconds.
const EPOCH_MS: u64 = 1_767_225_600_000;

#[derive(Debug)]
pub struct IdGenerator {
    worker: u64,
    state: Mutex<(u64, u64)>,
}

impl IdGenerator {
    pub fn new(worker: u16) -> Self {
        Self {
            worker: u64::from(worker & 0x3ff),
            state: Mutex::new((0, 0)),
        }
    }

    /// A new id, strictly greater than every earlier id from this generator.
    pub fn next(&self) -> i64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(EPOCH_MS)
            .saturating_sub(EPOCH_MS);
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (last_ms, seq) = *state;
        let (ms, seq) = if now > last_ms {
            (now, 0)
        } else if seq < 0xfff {
            (last_ms, seq + 1)
        } else {
            // Sequence exhausted in this millisecond (or the clock went back): borrow the next millisecond.
            (last_ms + 1, 0)
        };
        *state = (ms, seq);
        ((ms << 22) | (self.worker << 12) | seq) as i64
    }
}

/// Parses a decimal id as the API sends it (`^[1-9][0-9]{0,18}$`, fits in i64).
pub fn parse_id(s: &str) -> Option<i64> {
    let bytes = s.as_bytes();
    if bytes.is_empty() || bytes.len() > 19 || bytes[0] == b'0' || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    s.parse::<i64>().ok().filter(|n| *n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_increase_and_carry_the_worker() {
        let generator = IdGenerator::new(5);
        let mut last = 0;
        for _ in 0..10_000 {
            let id = generator.next();
            assert!(id > last);
            assert_eq!((id >> 12) & 0x3ff, 5);
            last = id;
        }
    }

    #[test]
    fn parse_id_matches_the_contract_pattern() {
        assert_eq!(parse_id("1050000000000001"), Some(1_050_000_000_000_001));
        assert_eq!(parse_id("9223372036854775807"), Some(i64::MAX));
        for bad in ["", "0", "01", "-1", "1a", "9223372036854775808", "12345678901234567890"] {
            assert_eq!(parse_id(bad), None, "{bad}");
        }
    }
}

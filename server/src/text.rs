//! User text checks. The real filter (per-locale word lists, a classifier) is a later task (spec 9.3 and 15); this
//! module is the single place it plugs in. For now: no control characters, length limits, a placeholder word list,
//! and the under-13 strict mode (no links, no number runs that look like contact details).

/// Placeholder list; the moderation team owns the real one.
const BLOCKED_WORDS: [&str; 4] = ["fuck", "shit", "nazi", "rape"];

pub fn is_offensive(text: &str) -> bool {
    let lower = text.to_lowercase();
    BLOCKED_WORDS.iter().any(|w| lower.contains(w))
}

/// Trims and checks a single-line text such as a display name. Returns the cleaned value or an error code.
pub fn single_line(value: &str, min: usize, max: usize) -> Result<String, &'static str> {
    let v = value.trim();
    let len = v.chars().count();
    if len < min {
        return Err("too_short");
    }
    if len > max {
        return Err("too_long");
    }
    if v.chars().any(|c| c.is_control() || is_invisible(c)) {
        return Err("invalid_characters");
    }
    if is_offensive(v) {
        return Err("not_allowed");
    }
    Ok(v.to_owned())
}

/// Checks a multi-line text such as a bio (newlines allowed, other control characters not).
pub fn multi_line(value: &str, max: usize, strict: bool) -> Result<String, &'static str> {
    let v = value.trim();
    if v.chars().count() > max {
        return Err("too_long");
    }
    if v.chars()
        .any(|c| (c.is_control() && c != '\n') || is_invisible(c))
    {
        return Err("invalid_characters");
    }
    if is_offensive(v) {
        return Err("not_allowed");
    }
    if strict && has_contact_info(v) {
        return Err("contact_info");
    }
    Ok(v.to_owned())
}

fn is_invisible(c: char) -> bool {
    matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2064}' | '\u{FEFF}')
}

/// Links or digit runs (7+ digits, ignoring separators) that could be phone numbers or handles.
pub fn has_contact_info(text: &str) -> bool {
    let lower = text.to_lowercase();
    if ["http", "www.", ".com", ".net", ".gg", "discord", "@"]
        .iter()
        .any(|p| lower.contains(p))
    {
        return true;
    }
    let mut run = 0;
    for c in lower.chars() {
        if c.is_ascii_digit() {
            run += 1;
            if run >= 7 {
                return true;
            }
        } else if !matches!(c, ' ' | '-' | '.' | '(' | ')') {
            run = 0;
        }
    }
    false
}

/// Basic email shape check. Delivery proves the rest.
pub fn valid_email(email: &str) -> bool {
    let email = email.trim();
    let Some((local, domain)) = email.rsplit_once('@') else {
        return false;
    };
    (1..=254).contains(&email.len())
        && !local.is_empty()
        && local.len() <= 64
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && email.chars().all(|c| c.is_ascii_graphic())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_line_rules() {
        assert_eq!(single_line("  Kit  ", 1, 32), Ok("Kit".to_owned()));
        assert_eq!(single_line("", 1, 32), Err("too_short"));
        assert_eq!(single_line(&"x".repeat(33), 1, 32), Err("too_long"));
        assert_eq!(single_line("a\u{202E}b", 1, 32), Err("invalid_characters"));
        assert_eq!(single_line("Ferro 鉄", 1, 32), Ok("Ferro 鉄".to_owned()));
    }

    #[test]
    fn strict_mode_blocks_contact_details() {
        assert!(has_contact_info("call 555-123-4567"));
        assert!(has_contact_info("see www.example.com"));
        assert!(!has_contact_info("I have 3 cats and 12 hats"));
        assert_eq!(
            multi_line("add me on discord", 1000, true),
            Err("contact_info")
        );
        assert!(multi_line("add me on discord", 1000, false).is_ok());
    }

    #[test]
    fn emails() {
        assert!(valid_email("kit@example.com"));
        for bad in [
            "kit",
            "kit@",
            "@example.com",
            "kit@example",
            "k it@example.com",
        ] {
            assert!(!valid_email(bad), "{bad}");
        }
    }
}

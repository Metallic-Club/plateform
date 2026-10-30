//! Tokens, keyed hashes, personal-data encryption and password hashing.
//!
//! - Tokens are 256-bit random values, sent base64url, stored only as SHA-256 hashes.
//! - Keyed hashes (HMAC-SHA-256) give stable lookups for emails and IPs without storing them in clear.
//! - Emails and birth dates are encrypted with AES-256-GCM (random 96-bit nonce prepended to the ciphertext).
//! - Passwords use Argon2id at OWASP's minimum (m = 19 MiB, t = 2, p = 1) or stronger.

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::Rng as _;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// `n` random bytes from the OS-seeded CSPRNG.
pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    rand::rng().fill_bytes(&mut out);
    out
}

/// A new opaque token: `prefix` + 256 random bits in base64url.
pub fn new_token(prefix: &str) -> String {
    format!("{prefix}{}", URL_SAFE_NO_PAD.encode(random_bytes::<32>()))
}

/// SHA-256 of a token, the only form stored in the database.
pub fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Constant-time equality for secrets.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && bool::from(a.ct_eq(b))
}

/// Keyed hash with a purpose label so one key serves several uses without cross-use.
pub fn keyed_hash(key: &[u8], purpose: &str, value: &[u8]) -> Vec<u8> {
    let mut mac = <HmacSha256 as hmac::KeyInit>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(purpose.as_bytes());
    mac.update(&[0]);
    mac.update(value);
    mac.finalize().into_bytes().to_vec()
}

/// Keyed hash of a normalised email address (trimmed, lower-case).
pub fn email_hash(key: &[u8], email: &str) -> Vec<u8> {
    keyed_hash(key, "email", email.trim().to_lowercase().as_bytes())
}

/// The CSRF token bound to a browser session.
pub fn csrf_token(key: &[u8], session_hash: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(keyed_hash(key, "csrf", session_hash))
}

/// Encrypts personal data. `context` (e.g. "email") is bound as associated data.
pub fn encrypt(key: &[u8; 32], context: &str, plaintext: &[u8]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce_bytes = random_bytes::<12>();
    let nonce = Nonce::from(nonce_bytes);
    let mut out = nonce_bytes.to_vec();
    let sealed = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad: context.as_bytes(),
            },
        )
        .expect("AES-GCM encryption does not fail for in-memory buffers");
    out.extend_from_slice(&sealed);
    out
}

/// Decrypts data from [`encrypt`]. None if the key, context or data do not match.
pub fn decrypt(key: &[u8; 32], context: &str, data: &[u8]) -> Option<Vec<u8>> {
    if data.len() < 12 {
        return None;
    }
    let (nonce, sealed) = data.split_at(12);
    let nonce: [u8; 12] = nonce.try_into().ok()?;
    Aes256Gcm::new(key.into())
        .decrypt(
            &Nonce::from(nonce),
            Payload {
                msg: sealed,
                aad: context.as_bytes(),
            },
        )
        .ok()
}

fn argon2() -> Argon2<'static> {
    let params = Params::new(19 * 1024, 2, 1, None).expect("valid Argon2 parameters");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Argon2id PHC string. CPU-heavy: call from `spawn_blocking`.
pub fn hash_password(password: &str) -> String {
    argon2()
        .hash_password_with_salt(password.as_bytes(), &random_bytes::<16>())
        .expect("Argon2 hashing does not fail with valid parameters")
        .to_string()
}

/// Checks a password against a PHC string. CPU-heavy: call from `spawn_blocking`.
pub fn verify_password(password: &str, phc: &str) -> bool {
    // Parse first so malformed input is rejected cheaply; the verifier re-reads the parameters from the string.
    PasswordHash::new(phc).is_ok() && argon2().verify_password(password.as_bytes(), phc).is_ok()
}

/// A valid hash of a random password, verified against when a login names no account so timing does not tell.
pub fn dummy_password_hash() -> &'static str {
    static DUMMY: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    DUMMY.get_or_init(|| hash_password(&new_token("dummy")))
}

/// Masks an email for display: `k***@example.com`.
pub fn mask_email(email: &str) -> String {
    match email.split_once('@') {
        Some((local, domain)) => {
            let first: String = local.chars().take(1).collect();
            format!("{first}***@{domain}")
        }
        None => "***".to_owned(),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_hash_stably() {
        let a = new_token("mat_");
        let b = new_token("mat_");
        assert_ne!(a, b);
        assert!(a.starts_with("mat_") && a.len() == 4 + 43);
        assert_eq!(token_hash(&a), token_hash(&a));
        assert_eq!(token_hash(&a).len(), 32);
    }

    #[test]
    fn constant_time_compare() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"abcd"));
    }

    #[test]
    fn keyed_hashes_depend_on_purpose_and_normalise_email() {
        let key = [7u8; 32];
        assert_eq!(email_hash(&key, " Kit@Example.com "), email_hash(&key, "kit@example.com"));
        assert_ne!(keyed_hash(&key, "a", b"x"), keyed_hash(&key, "b", b"x"));
    }

    #[test]
    fn encryption_round_trips_and_binds_context() {
        let key = [9u8; 32];
        let sealed = encrypt(&key, "email", b"kit@example.com");
        assert_eq!(decrypt(&key, "email", &sealed).unwrap(), b"kit@example.com");
        assert!(decrypt(&key, "birth_date", &sealed).is_none());
        assert!(decrypt(&[1u8; 32], "email", &sealed).is_none());
        assert_ne!(encrypt(&key, "email", b"x"), encrypt(&key, "email", b"x"), "nonces are random");
    }

    #[test]
    fn argon2id_hash_and_verify() {
        let phc = hash_password("correct-horse-battery-staple");
        assert!(phc.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
        assert!(verify_password("correct-horse-battery-staple", &phc));
        assert!(!verify_password("wrong-password", &phc));
        assert!(!verify_password("x", "not a hash"));
    }

    #[test]
    fn masks_email() {
        assert_eq!(mask_email("kit@example.com"), "k***@example.com");
    }
}

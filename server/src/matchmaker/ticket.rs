//! Ed25519-signed join tickets and knock tokens, and the signing keyring. Byte layout, verification rules and test
//! vectors: `docs/m2-join-tickets.md`. Game servers and edges verify tickets offline with the public keys from
//! `GET /v1/net/keys`; the backend stays the online single-use check (`redeemJoinTicket`).
//!
//! Never log a ticket, a knock token or key material. `Keyring` and `Claims` have redacting `Debug` impls.

use std::{fmt, net::IpAddr};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, Signer as _, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

/// Audience every join ticket carries. Edges and servers reject any other value.
pub const AUDIENCE: &str = "metallic-server";
/// Prefix of the ticket string; the version also sits in the signed payload's magic.
pub const TICKET_PREFIX: &str = "mjt1.";
/// Prefix of the knock-token string.
pub const KNOCK_PREFIX: &str = "mkt1.";
/// Longest ticket string any endpoint accepts (spec 8.1). Encoded tickets are at most 474 characters.
pub const MAX_TICKET_LEN: usize = 512;
/// Longest ticket lifetime a verifier accepts (`exp - iat`).
pub const MAX_TTL_SECS: i64 = 60;

const TICKET_MAGIC: [u8; 4] = *b"MJT\x01";
const KNOCK_MAGIC: [u8; 4] = *b"MKT\x01";
const MAX_KID: usize = 32;
const MAX_REGION: usize = 21;
const MAX_NAME: usize = 128;
const MAX_KEYS: usize = 16;

/// What a ticket admits to. The edge routes `edit` tickets only to edit sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Play,
    Edit,
    Test,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Play => "play",
            Self::Edit => "edit",
            Self::Test => "test",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "play" => Some(Self::Play),
            "edit" => Some(Self::Edit),
            "test" => Some(Self::Test),
            _ => None,
        }
    }
    fn byte(self) -> u8 {
        match self {
            Self::Play => 1,
            Self::Edit => 2,
            Self::Test => 3,
        }
    }
    fn from_byte(b: u8) -> Option<Self> {
        match b {
            1 => Some(Self::Play),
            2 => Some(Self::Edit),
            3 => Some(Self::Test),
            _ => None,
        }
    }
}

/// The signed claims. `server` is 0 when the ticket is not bound to a server (legacy flow; hosted edges reject it).
#[derive(Clone, PartialEq, Eq)]
pub struct Claims {
    pub kid: String,
    pub jti: [u8; 16],
    pub iat: i64,
    pub exp: i64,
    pub user: i64,
    pub game: i64,
    pub place: i64,
    pub server: i64,
    pub kind: Kind,
    pub aud: String,
    /// Region tag, empty when none.
    pub region: String,
    /// Optional client-address binding (off by default, `METALLIC_TICKET_BIND_IP`).
    pub ip: Option<IpAddr>,
    pub display_name: String,
}

impl fmt::Debug for Claims {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Claims")
            .field("kid", &self.kid)
            .field("server", &self.server)
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}

fn kid_ok(kid: &str) -> bool {
    (1..=MAX_KID).contains(&kid.len())
        && kid
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

/// Cuts a UTF-8 string to at most `max` bytes on a character boundary.
fn clip(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn push_short(out: &mut Vec<u8>, bytes: &[u8]) {
    out.push(bytes.len() as u8);
    out.extend_from_slice(bytes);
}

fn push_ip(out: &mut Vec<u8>, ip: Option<IpAddr>) {
    match ip {
        None => out.push(0),
        Some(IpAddr::V4(v4)) => {
            out.push(4);
            out.extend_from_slice(&v4.octets());
        }
        Some(IpAddr::V6(v6)) => {
            out.push(6);
            out.extend_from_slice(&v6.octets());
        }
    }
}

/// Encodes the claims (layout in the docs). Lengths are clipped or rejected so the result is always well formed.
pub fn encode_claims(c: &Claims) -> Option<Vec<u8>> {
    if !kid_ok(&c.kid)
        || c.aud.is_empty()
        || c.aud.len() > MAX_KID
        || c.region.len() > MAX_REGION
        || !c.region.is_ascii()
        || c.iat < 0
        || c.exp < 0
        || c.user < 0
        || c.game < 0
        || c.place < 0
        || c.server < 0
    {
        return None;
    }
    let name = clip(&c.display_name, MAX_NAME);
    let mut out = Vec::with_capacity(300);
    out.extend_from_slice(&TICKET_MAGIC);
    push_short(&mut out, c.kid.as_bytes());
    out.extend_from_slice(&c.jti);
    for n in [c.iat, c.exp, c.user, c.game, c.place, c.server] {
        out.extend_from_slice(&(n as u64).to_be_bytes());
    }
    out.push(c.kind.byte());
    push_short(&mut out, c.aud.as_bytes());
    push_short(&mut out, c.region.as_bytes());
    push_ip(&mut out, c.ip);
    push_short(&mut out, name.as_bytes());
    Some(out)
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.at.checked_add(n)?;
        let out = self.bytes.get(self.at..end)?;
        self.at = end;
        Some(out)
    }
    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|b| b[0])
    }
    fn u64(&mut self) -> Option<i64> {
        let v = u64::from_be_bytes(self.take(8)?.try_into().ok()?);
        i64::try_from(v).ok()
    }
    fn short(&mut self, max: usize) -> Option<&'a [u8]> {
        let n = usize::from(self.u8()?);
        if n > max {
            return None;
        }
        self.take(n)
    }
    fn ip(&mut self) -> Option<Option<IpAddr>> {
        match self.u8()? {
            0 => Some(None),
            4 => {
                let b: [u8; 4] = self.take(4)?.try_into().ok()?;
                Some(Some(IpAddr::from(b)))
            }
            6 => {
                let b: [u8; 16] = self.take(16)?.try_into().ok()?;
                Some(Some(IpAddr::from(b)))
            }
            _ => None,
        }
    }
    fn done(&self) -> bool {
        self.at == self.bytes.len()
    }
}

/// Strict decoder: wrong magic, out-of-range lengths, unknown kind or trailing bytes all fail.
pub fn decode_claims(bytes: &[u8]) -> Option<Claims> {
    let mut r = Reader { bytes, at: 0 };
    if r.take(4)? != TICKET_MAGIC {
        return None;
    }
    let kid = std::str::from_utf8(r.short(MAX_KID)?).ok()?.to_owned();
    if !kid_ok(&kid) {
        return None;
    }
    let jti: [u8; 16] = r.take(16)?.try_into().ok()?;
    let (iat, exp, user, game, place, server) =
        (r.u64()?, r.u64()?, r.u64()?, r.u64()?, r.u64()?, r.u64()?);
    let kind = Kind::from_byte(r.u8()?)?;
    let aud = std::str::from_utf8(r.short(MAX_KID)?).ok()?.to_owned();
    let region = std::str::from_utf8(r.short(MAX_REGION)?).ok()?.to_owned();
    let ip = r.ip()?;
    let display_name = std::str::from_utf8(r.short(MAX_NAME)?).ok()?.to_owned();
    if aud.is_empty() || !r.done() {
        return None;
    }
    Some(Claims {
        kid,
        jti,
        iat,
        exp,
        user,
        game,
        place,
        server,
        kind,
        aud,
        region,
        ip,
        display_name,
    })
}

/// Why a ticket failed. Verifiers answer every case with one generic error to the client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyError {
    Malformed,
    UnknownKey,
    BadSignature,
    WrongAudience,
    Expired,
    NotYetValid,
    LifetimeTooLong,
}

/// Splits `prefix || b64(payload) || "." || b64(sig)` and checks the signature with the key named in the payload.
fn open<'k>(
    text: &str,
    prefix: &str,
    kid_of: impl Fn(&[u8]) -> Option<String>,
    key: impl Fn(&str) -> Option<&'k VerifyingKey>,
) -> Result<Vec<u8>, VerifyError> {
    if text.len() > MAX_TICKET_LEN {
        return Err(VerifyError::Malformed);
    }
    let rest = text.strip_prefix(prefix).ok_or(VerifyError::Malformed)?;
    let (payload, sig) = rest.split_once('.').ok_or(VerifyError::Malformed)?;
    let payload = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| VerifyError::Malformed)?;
    let sig: [u8; 64] = URL_SAFE_NO_PAD
        .decode(sig)
        .ok()
        .and_then(|s| s.try_into().ok())
        .ok_or(VerifyError::Malformed)?;
    let kid = kid_of(&payload).ok_or(VerifyError::Malformed)?;
    let key = key(&kid).ok_or(VerifyError::UnknownKey)?;
    key.verify_strict(&payload, &Signature::from_bytes(&sig))
        .map_err(|_| VerifyError::BadSignature)?;
    Ok(payload)
}

fn kid_after_magic(magic: [u8; 4]) -> impl Fn(&[u8]) -> Option<String> {
    move |payload: &[u8]| {
        let mut r = Reader {
            bytes: payload,
            at: 0,
        };
        if r.take(4)? != magic {
            return None;
        }
        let kid = std::str::from_utf8(r.short(MAX_KID)?).ok()?;
        kid_ok(kid).then(|| kid.to_owned())
    }
}

/// Reference verifier (the edge and `metallic_net::ticket` implement the same steps, see the docs). Checks format,
/// signature, audience and time; the caller still checks `server`, `kind`, `ip` and the `jti` replay set.
pub fn verify<'k>(
    text: &str,
    now: i64,
    key: impl Fn(&str) -> Option<&'k VerifyingKey>,
) -> Result<Claims, VerifyError> {
    let payload = open(text, TICKET_PREFIX, kid_after_magic(TICKET_MAGIC), key)?;
    let c = decode_claims(&payload).ok_or(VerifyError::Malformed)?;
    if c.aud != AUDIENCE {
        return Err(VerifyError::WrongAudience);
    }
    if c.exp <= c.iat || c.exp - c.iat > MAX_TTL_SECS {
        return Err(VerifyError::LifetimeTooLong);
    }
    if c.iat > now + 5 {
        return Err(VerifyError::NotYetValid);
    }
    if now >= c.exp {
        return Err(VerifyError::Expired);
    }
    Ok(c)
}

/// The knock token for the edge's under-attack mode: allowlists one client address for one server until `exp`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Knock {
    pub kid: String,
    pub ip: IpAddr,
    pub server: i64,
    pub exp: i64,
}

pub fn encode_knock(k: &Knock) -> Option<Vec<u8>> {
    if !kid_ok(&k.kid) || k.server < 0 || k.exp < 0 {
        return None;
    }
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&KNOCK_MAGIC);
    push_short(&mut out, k.kid.as_bytes());
    push_ip(&mut out, Some(k.ip));
    out.extend_from_slice(&(k.server as u64).to_be_bytes());
    out.extend_from_slice(&(k.exp as u64).to_be_bytes());
    Some(out)
}

pub fn decode_knock(bytes: &[u8]) -> Option<Knock> {
    let mut r = Reader { bytes, at: 0 };
    if r.take(4)? != KNOCK_MAGIC {
        return None;
    }
    let kid = std::str::from_utf8(r.short(MAX_KID)?).ok()?.to_owned();
    let ip = r.ip()??;
    let (server, exp) = (r.u64()?, r.u64()?);
    (kid_ok(&kid) && r.done()).then_some(Knock {
        kid,
        ip,
        server,
        exp,
    })
}

/// Reference knock verifier: signature and expiry; the caller compares `ip` with the datagram's source.
pub fn verify_knock<'k>(
    text: &str,
    now: i64,
    key: impl Fn(&str) -> Option<&'k VerifyingKey>,
) -> Result<Knock, VerifyError> {
    let payload = open(text, KNOCK_PREFIX, kid_after_magic(KNOCK_MAGIC), key)?;
    let k = decode_knock(&payload).ok_or(VerifyError::Malformed)?;
    if now >= k.exp {
        return Err(VerifyError::Expired);
    }
    Ok(k)
}

fn seal(prefix: &str, key: &SigningKey, payload: &[u8]) -> String {
    let sig = key.sign(payload);
    format!(
        "{prefix}{}.{}",
        URL_SAFE_NO_PAD.encode(payload),
        URL_SAFE_NO_PAD.encode(sig.to_bytes())
    )
}

// ------------------------------------------------------------------ keyring

/// Publication state of a key (spec 8.3 "Keys").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyStatus {
    /// Signs new tickets. Exactly one.
    Active,
    /// Published ahead of activation (at least 1 hour) so every verifier has it before the first ticket.
    Next,
    /// No longer signs; listed until `notAfter` (at least 10 minutes after its last ticket expired).
    Retired,
}

/// One entry of the keyset file (`METALLIC_TICKET_KEYS_FILE`) or variable (`METALLIC_TICKET_KEYS`, base64 of it).
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KeyEntry {
    pub kid: String,
    pub status: KeyStatus,
    /// Private seed, 32 bytes base64url. Required for the active key; never for anything published.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub d: Option<String>,
    /// Public key, 32 bytes base64url. Derived from `d` when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub not_before: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub not_after: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeySet {
    keys: Vec<KeyEntry>,
}

/// A public key as the keyring publishes it.
#[derive(Clone)]
pub struct PublicKey {
    pub kid: String,
    pub status: KeyStatus,
    pub key: VerifyingKey,
    pub not_before: Option<OffsetDateTime>,
    pub not_after: Option<OffsetDateTime>,
}

/// The signing key plus every published public key. `Debug` never prints key material.
pub struct Keyring {
    active_kid: String,
    signing: SigningKey,
    keys: Vec<PublicKey>,
    version: String,
    ephemeral: bool,
}

impl fmt::Debug for Keyring {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Keyring")
            .field("active_kid", &self.active_kid)
            .field("keys", &self.keys.len())
            .field("ephemeral", &self.ephemeral)
            .finish_non_exhaustive()
    }
}

fn b64_32(field: &str, value: &str) -> Result<[u8; 32], String> {
    URL_SAFE_NO_PAD
        .decode(value.trim())
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| format!("{field} must be 32 bytes of unpadded base64url"))
}

fn time_field(
    kid: &str,
    field: &str,
    value: Option<&str>,
) -> Result<Option<OffsetDateTime>, String> {
    value
        .map(|v| {
            OffsetDateTime::parse(v, &Rfc3339)
                .map_err(|_| format!("key {kid}: {field} must be an RFC 3339 time"))
        })
        .transpose()
}

impl Keyring {
    /// Parses and checks a keyset JSON document at time `now`.
    pub fn from_json(json: &[u8], now: OffsetDateTime) -> Result<Self, String> {
        let set: KeySet = serde_json::from_slice(json)
            .map_err(|_| "the keyset is not valid JSON of the documented shape".to_owned())?;
        if set.keys.is_empty() || set.keys.len() > MAX_KEYS {
            return Err(format!("the keyset needs 1 to {MAX_KEYS} keys"));
        }
        let mut active: Option<(String, SigningKey)> = None;
        let mut keys = Vec::new();
        for e in &set.keys {
            if !kid_ok(&e.kid) {
                return Err("a kid must be 1 to 32 characters of A-Z a-z 0-9 _ -".to_owned());
            }
            if keys.iter().any(|k: &PublicKey| k.kid == e.kid) {
                return Err(format!("kid {} appears twice", e.kid));
            }
            let signing =
                e.d.as_deref()
                    .map(|d| b64_32("d", d).map(|b| SigningKey::from_bytes(&b)))
                    .transpose()
                    .map_err(|m| format!("key {}: {m}", e.kid))?;
            let public = match (&signing, e.x.as_deref()) {
                (Some(s), None) => s.verifying_key(),
                (s, Some(x)) => {
                    let key = VerifyingKey::from_bytes(
                        &b64_32("x", x).map_err(|m| format!("key {}: {m}", e.kid))?,
                    )
                    .map_err(|_| format!("key {}: x is not an Ed25519 public key", e.kid))?;
                    if s.as_ref().is_some_and(|s| s.verifying_key() != key) {
                        return Err(format!("key {}: x does not match d", e.kid));
                    }
                    key
                }
                (None, None) => return Err(format!("key {}: give x or d", e.kid)),
            };
            if public.is_weak() {
                return Err(format!("key {}: weak public key", e.kid));
            }
            let not_before = time_field(&e.kid, "notBefore", e.not_before.as_deref())?;
            let not_after = time_field(&e.kid, "notAfter", e.not_after.as_deref())?;
            match e.status {
                KeyStatus::Active => {
                    let Some(s) = signing else {
                        return Err(format!("active key {} needs d", e.kid));
                    };
                    if active.is_some() {
                        return Err("exactly one key may be active".to_owned());
                    }
                    if not_before.is_some_and(|t| t > now) {
                        return Err(format!("active key {} is not valid yet (notBefore)", e.kid));
                    }
                    if not_after.is_some_and(|t| t <= now + time::Duration::minutes(10)) {
                        return Err(format!("active key {} expires within 10 minutes", e.kid));
                    }
                    active = Some((e.kid.clone(), s));
                }
                KeyStatus::Retired if not_after.is_none() => {
                    return Err(format!("retired key {} needs notAfter", e.kid));
                }
                _ => {}
            }
            keys.push(PublicKey {
                kid: e.kid.clone(),
                status: e.status,
                key: public,
                not_before,
                not_after,
            });
        }
        let (active_kid, signing) = active.ok_or("one key must be active")?;
        Ok(Self::assemble(active_kid, signing, keys, false))
    }

    /// A random key for local development only. The process warns loudly when it uses one: tickets die on restart.
    pub fn ephemeral() -> Self {
        let signing = SigningKey::from_bytes(&crate::crypto::random_bytes::<32>());
        let kid = format!(
            "dev-{}",
            URL_SAFE_NO_PAD.encode(crate::crypto::random_bytes::<6>())
        );
        let keys = vec![PublicKey {
            kid: kid.clone(),
            status: KeyStatus::Active,
            key: signing.verifying_key(),
            not_before: None,
            not_after: None,
        }];
        Self::assemble(kid, signing, keys, true)
    }

    fn assemble(
        active_kid: String,
        signing: SigningKey,
        keys: Vec<PublicKey>,
        ephemeral: bool,
    ) -> Self {
        let mut h = Sha256::new();
        for k in &keys {
            h.update(k.kid.as_bytes());
            h.update([0, k.status as u8]);
            h.update(k.key.as_bytes());
            for t in [k.not_before, k.not_after] {
                h.update(
                    t.map_or(i64::MIN, OffsetDateTime::unix_timestamp)
                        .to_be_bytes(),
                );
            }
        }
        let version = h.finalize()[..8]
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        Self {
            active_kid,
            signing,
            keys,
            version,
            ephemeral,
        }
    }

    pub fn is_ephemeral(&self) -> bool {
        self.ephemeral
    }

    pub fn active_kid(&self) -> &str {
        &self.active_kid
    }

    /// Changes whenever the published set changes; host heartbeats carry it so agents refetch keys.
    pub fn version(&self) -> &str {
        &self.version
    }

    /// Keys to publish at `now`: retired keys drop out after their `notAfter`.
    pub fn published(&self, now: OffsetDateTime) -> impl Iterator<Item = &PublicKey> {
        self.keys.iter().filter(move |k| {
            !(k.status == KeyStatus::Retired && k.not_after.is_some_and(|t| t <= now))
        })
    }

    /// A published key by kid, for verification.
    pub fn key(&self, kid: &str) -> Option<&VerifyingKey> {
        self.keys.iter().find(|k| k.kid == kid).map(|k| &k.key)
    }

    /// Signs claims with the active key (the `kid` field is set here).
    pub fn issue(&self, mut claims: Claims) -> Option<String> {
        claims.kid = self.active_kid.clone();
        let payload = encode_claims(&claims)?;
        Some(seal(TICKET_PREFIX, &self.signing, &payload))
    }

    /// Signs a knock token with the active key.
    pub fn knock(&self, ip: IpAddr, server: i64, exp: i64) -> Option<String> {
        let payload = encode_knock(&Knock {
            kid: self.active_kid.clone(),
            ip,
            server,
            exp,
        })?;
        Some(seal(KNOCK_PREFIX, &self.signing, &payload))
    }
}

/// A fresh keyset entry for `metallic-platform ticket-key new`. The seed is printed once; store it as a secret.
pub fn new_key_entry(
    kid: &str,
    status: KeyStatus,
    not_before: Option<OffsetDateTime>,
) -> Result<KeyEntry, String> {
    if !kid_ok(kid) {
        return Err("kid must be 1 to 32 characters of A-Z a-z 0-9 _ -".to_owned());
    }
    let seed = crate::crypto::random_bytes::<32>();
    let signing = SigningKey::from_bytes(&seed);
    Ok(KeyEntry {
        kid: kid.to_owned(),
        status,
        d: Some(URL_SAFE_NO_PAD.encode(seed)),
        x: Some(URL_SAFE_NO_PAD.encode(signing.verifying_key().as_bytes())),
        not_before: not_before.and_then(|t| t.format(&Rfc3339).ok()),
        not_after: None,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    /// Test-only seed 00 01 02 ... 1f. Clearly fake; never use it anywhere else.
    const TEST_SEED: [u8; 32] = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31,
    ];

    fn test_keyring() -> Keyring {
        let d = URL_SAFE_NO_PAD.encode(TEST_SEED);
        let json = format!(r#"{{"keys":[{{"kid":"test-2026-10","status":"active","d":"{d}"}}]}}"#);
        Keyring::from_json(json.as_bytes(), OffsetDateTime::now_utc()).unwrap()
    }

    fn vector_claims() -> Claims {
        Claims {
            kid: String::new(),
            jti: [0x11; 16],
            iat: 1_793_318_400,
            exp: 1_793_318_460,
            user: 1_000_000_000_000_001,
            game: 1_000_000_000_000_101,
            place: 1_000_000_000_001_101,
            server: 4_050_000_000_000_301,
            kind: Kind::Play,
            aud: AUDIENCE.to_owned(),
            region: "us-central".to_owned(),
            ip: None,
            display_name: "Ada".to_owned(),
        }
    }

    /// Test vectors in `docs/m2-join-tickets.md` section 6 (cross-checked with an independent Ed25519 library).
    /// A change here is a wire-format change.
    const PUBLIC_X: &str = "A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg";
    const VECTOR_1: &str = "mjt1.TUpUAQx0ZXN0LTIwMjYtMTARERERERERERERERERERERAAAAAGrj3gAAAAAAauPePAADjX6kxoABAAONfqTGgGUAA41-pMaETQAOY3QbVyEtAQ9tZXRhbGxpYy1zZXJ2ZXIKdXMtY2VudHJhbAADQWRh.4_GX-BYlIsxEI4cKOSvmMelHM7VNt1agtMwmDhAAvljcJ34Ki9zjPBOJQ9iF0s0sWXZUlNaMo71qFw9LR2xaAg";
    const VECTOR_2: &str = "mjt1.TUpUAQx0ZXN0LTIwMjYtMTARERERERERERERERERERERAAAAAGrj3gAAAAAAauPePAADjX6kxoABAAONfqTGgGUAA41-pMaETQAAAAAAAAAAAg9tZXRhbGxpYy1zZXJ2ZXIABMsAcQcEWm_Dqw.qdcOECZRhd5N2dTh8Vxpfzo2kovL6RWHHqdCNr35FNvXcnK-pyyRjbffU7bVMKiPPIUfSVHFC9g6XyN7k7mCDQ";
    const KNOCK_1: &str = "mkt1.TUtUAQx0ZXN0LTIwMjYtMTAEywBxBwAOY3QbVyEtAAAAAGrj3jw.e9cJZHMerZQ8xPq2jELlbF2gC9P3wL1vWs4yAel8Ee4b6-rF6tbL8n-VfKI0mW1RsArKN6Ohn7AvVyozI-6gCQ";

    #[test]
    fn test_vectors_are_exact() {
        let ring = test_keyring();
        let t1 = ring.issue(vector_claims()).unwrap();
        let mut c2 = vector_claims();
        c2.kind = Kind::Edit;
        c2.server = 0;
        c2.region = String::new();
        c2.ip = Some("203.0.113.7".parse().unwrap());
        c2.display_name = "Zoë".to_owned();
        let t2 = ring.issue(c2).unwrap();
        let k1 = ring
            .knock(
                "203.0.113.7".parse().unwrap(),
                4_050_000_000_000_301,
                1_793_318_460,
            )
            .unwrap();
        assert_eq!(
            URL_SAFE_NO_PAD.encode(ring.key("test-2026-10").unwrap().as_bytes()),
            PUBLIC_X
        );
        assert_eq!(t1, VECTOR_1);
        assert_eq!(t2, VECTOR_2);
        assert_eq!(k1, KNOCK_1);
        let now = 1_793_318_410;
        let c = verify(VECTOR_2, now, |k| ring.key(k)).unwrap();
        assert_eq!((c.kind, c.server), (Kind::Edit, 0));
        assert_eq!(c.display_name, "Zo\u{eb}");
        assert_eq!(c.ip, Some("203.0.113.7".parse().unwrap()));
        let k = verify_knock(KNOCK_1, now, |k| ring.key(k)).unwrap();
        assert_eq!(k.server, 4_050_000_000_000_301);
    }

    #[test]
    fn verify_round_trip_and_rejections() {
        let ring = test_keyring();
        let c = vector_claims();
        let t = ring.issue(c.clone()).unwrap();
        let now = c.iat + 10;
        let got = verify(&t, now, |k| ring.key(k)).unwrap();
        assert_eq!(got.kid, "test-2026-10");
        assert_eq!(got.server, c.server);
        assert_eq!(got.display_name, "Ada");
        assert!(t.len() <= MAX_TICKET_LEN);
        assert_eq!(
            verify(&t, c.exp, |k| ring.key(k)),
            Err(VerifyError::Expired)
        );
        assert_eq!(
            verify(&t, c.iat - 60, |k| ring.key(k)),
            Err(VerifyError::NotYetValid)
        );
        assert_eq!(verify(&t, now, |_| None), Err(VerifyError::UnknownKey));
        // Flip one payload character: the signature no longer matches (or the payload no longer parses).
        let mut bad = t.clone().into_bytes();
        bad[TICKET_PREFIX.len() + 40] ^= 0x01;
        let bad = String::from_utf8(bad).unwrap();
        assert!(verify(&bad, now, |k| ring.key(k)).is_err());
        // A wrong audience or a long lifetime is refused even when correctly signed.
        let mut other = c.clone();
        other.aud = "metallic-edit".into();
        let t = ring.issue(other).unwrap();
        assert_eq!(
            verify(&t, now, |k| ring.key(k)),
            Err(VerifyError::WrongAudience)
        );
        let mut long = c.clone();
        long.exp = long.iat + 61;
        let t = ring.issue(long).unwrap();
        assert_eq!(
            verify(&t, now, |k| ring.key(k)),
            Err(VerifyError::LifetimeTooLong)
        );
        for junk in ["", "mjt1.", "mjt1.a.b", "jt_abc", "mjt1.AAAA.AAAA"] {
            assert!(verify(junk, now, |k| ring.key(k)).is_err());
        }
    }

    #[test]
    fn longest_ticket_fits_the_contract() {
        let ring = test_keyring();
        let mut c = vector_claims();
        c.display_name = "\u{1F600}".repeat(32);
        c.region = "abcdefgh-abcdefghijkl".into();
        c.ip = Some("2001:db8::1".parse().unwrap());
        c.user = i64::MAX;
        let t = ring.issue(c).unwrap();
        assert!(t.len() <= MAX_TICKET_LEN, "{} characters", t.len());
    }

    #[test]
    fn knock_round_trip() {
        let ring = test_keyring();
        let ip: IpAddr = "198.51.100.4".parse().unwrap();
        let t = ring.knock(ip, 42, 2_000_000_000).unwrap();
        let k = verify_knock(&t, 1_999_999_999, |k| ring.key(k)).unwrap();
        assert_eq!((k.ip, k.server), (ip, 42));
        assert!(verify_knock(&t, 2_000_000_000, |k| ring.key(k)).is_err());
        // A knock token is not a ticket and vice versa.
        assert!(verify(&t, 1_999_999_999, |k| ring.key(k)).is_err());
    }

    #[test]
    fn keyset_rules() {
        let now = OffsetDateTime::now_utc();
        let d = URL_SAFE_NO_PAD.encode(TEST_SEED);
        let ok = |j: &str| Keyring::from_json(j.as_bytes(), now);
        assert!(ok(r#"{"keys":[]}"#).is_err());
        assert!(ok(r#"{"keys":[{"kid":"a","status":"next","x":"AAAA"}]}"#).is_err());
        assert!(
            ok(&format!(
                r#"{{"keys":[{{"kid":"a","status":"retired","d":"{d}"}}]}}"#
            ))
            .is_err(),
            "no active key, retired without notAfter"
        );
        assert!(
            ok(&format!(
                r#"{{"keys":[{{"kid":"a b","status":"active","d":"{d}"}}]}}"#
            ))
            .is_err(),
            "bad kid"
        );
        assert!(
            ok(&format!(
                r#"{{"keys":[{{"kid":"a","status":"active","d":"{d}","extra":1}}]}}"#
            ))
            .is_err(),
            "unknown fields"
        );
        let other = new_key_entry("b", KeyStatus::Next, None).unwrap();
        let x = other.x.unwrap();
        assert!(
            ok(&format!(
                r#"{{"keys":[{{"kid":"a","status":"active","d":"{d}","x":"{x}"}}]}}"#
            ))
            .is_err(),
            "x must match d"
        );
        let ring = ok(&format!(
            r#"{{"keys":[{{"kid":"a","status":"active","d":"{d}"}},{{"kid":"b","status":"next","x":"{x}"}},
                {{"kid":"c","status":"retired","x":"{x}","notAfter":"2000-01-01T00:00:00Z"}}]}}"#
        ))
        .unwrap();
        let published: Vec<&str> = ring.published(now).map(|k| k.kid.as_str()).collect();
        assert_eq!(
            published,
            ["a", "b"],
            "expired retired keys are not published"
        );
        assert!(!format!("{ring:?}").contains(&d), "Debug never prints keys");
        assert!(Keyring::ephemeral().is_ephemeral());
    }
}

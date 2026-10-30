//! catalog: avatar items (Marketplace), inventory (Wardrobe) and worn avatars. Read-only in P1 apart from equipping;
//! inventory rows are written only through [`crate::economy::grant_item`].

use std::collections::HashSet;

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgExecutor};
use time::OffsetDateTime;

use crate::{
    AppState,
    games::CreatorRef,
    http::{ApiJson, ApiQuery, Cursor, IdPath, Page, parse_flag, rfc3339},
    identity::auth::{MaybeViewer, Viewer},
    matchmaker::PageBody,
    problem::{ApiResult, Problem, Validator},
};

pub const CATEGORIES: [&str; 14] = [
    "hat", "hair", "face", "face_accessory", "neck", "shoulder", "back", "waist", "shirt", "pants", "shoes", "body", "emote", "bundle",
];
/// Accessories stack up to [`MAX_ACCESSORIES`] in total; every other wearable category is one slot.
const ACCESSORIES: [&str; 6] = ["hat", "face_accessory", "neck", "shoulder", "back", "waist"];
const MAX_ACCESSORIES: usize = 5;
const NOT_WEARABLE: [&str; 2] = ["emote", "bundle"];

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ItemRow {
    id: i64,
    creator_kind: String,
    creator_id: i64,
    creator_name: String,
    creator_first_party: bool,
    category: String,
    name: String,
    description: String,
    thumbnail_url: String,
    price: Option<i64>,
    on_sale: bool,
    limited_supply: Option<i32>,
    limited_remaining: Option<i32>,
    created_at: OffsetDateTime,
}

const ITEM_COLUMNS: &str = "i.id, i.creator_kind, i.creator_id, i.creator_name, i.creator_first_party, i.category, i.name, \
    i.description, i.thumbnail_url, i.price, i.on_sale, i.limited_supply, i.limited_remaining, i.created_at";

#[derive(Debug, Clone, Serialize)]
pub struct Price {
    currency: &'static str,
    amount: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limited {
    total_supply: i32,
    remaining: i32,
}

/// The `CatalogItemSummary` schema.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSummary {
    id: String,
    name: String,
    category: String,
    creator: CreatorRef,
    thumbnail_url: String,
    price: Option<Price>,
    on_sale: bool,
    limited: Option<Limited>,
}

impl ItemRow {
    fn summary(&self) -> ItemSummary {
        ItemSummary {
            id: self.id.to_string(),
            name: self.name.clone(),
            category: self.category.clone(),
            creator: CreatorRef {
                kind: self.creator_kind.clone(),
                id: self.creator_id.to_string(),
                name: self.creator_name.clone(),
                is_first_party: self.creator_first_party,
            },
            thumbnail_url: self.thumbnail_url.clone(),
            price: self.price.filter(|_| self.on_sale).map(|amount| Price { currency: crate::economy::CURRENCY, amount }),
            on_sale: self.on_sale && self.price.is_some(),
            limited: match (self.limited_supply, self.limited_remaining) {
                (Some(total_supply), Some(remaining)) => Some(Limited { total_supply, remaining }),
                _ => None,
            },
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    category: Option<String>,
    sort: Option<String>,
    q: Option<String>,
    creator_id: Option<String>,
    free: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

fn category(field: &str, c: Option<String>) -> ApiResult<Option<String>> {
    match c.filter(|c| !c.is_empty()) {
        None => Ok(None),
        Some(c) if CATEGORIES.contains(&c.as_str()) => Ok(Some(c)),
        Some(_) => Err(Problem::invalid(field, "invalid", "Unknown category.")),
    }
}

/// `listCatalogItems`
pub async fn list_items(State(state): State<AppState>, ApiQuery(q): ApiQuery<ListQuery>) -> ApiResult<Json<PageBody<ItemSummary>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let cat = category("category", q.category)?;
    let text = q.q.map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty());
    if text.as_ref().is_some_and(|t| t.chars().count() > 80) {
        return Err(Problem::invalid("q", "too_long", "Search with up to 80 characters."));
    }
    let creator = match q.creator_id.as_deref().filter(|c| !c.is_empty()) {
        None => None,
        Some(c) => Some(crate::ids::parse_id(c).ok_or_else(|| Problem::invalid("creatorId", "invalid", "Not an id."))?),
    };
    let free = parse_flag("free", q.free.as_deref())?;
    let order = match q.sort.as_deref().filter(|s| !s.is_empty()).unwrap_or("relevance") {
        "relevance" => {
            if text.is_some() {
                "(lower(i.name) = $2) DESC, word_similarity($2, lower(i.name)) DESC, i.sales_count DESC, i.id DESC"
            } else {
                "i.sales_count DESC, i.created_at DESC, i.id DESC"
            }
        }
        "newest" => "i.created_at DESC, i.id DESC",
        "best_selling" => "i.sales_count DESC, i.id DESC",
        "price_low" => "i.price ASC NULLS LAST, i.id DESC",
        "price_high" => "i.price DESC NULLS LAST, i.id DESC",
        _ => return Err(Problem::invalid("sort", "invalid", "Use relevance, newest, best_selling, price_low or price_high.")),
    };
    let mut rows: Vec<ItemRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ITEM_COLUMNS} FROM catalog.items i WHERE i.status = 'active' \
           AND ($1::text IS NULL OR i.category = $1) \
           AND ($2::text IS NULL OR lower(i.name) LIKE '%' || $3 || '%' OR word_similarity($2, lower(i.name)) > 0.4) \
           AND ($4::bigint IS NULL OR i.creator_id = $4) \
           AND ($5::bool IS NULL OR ($5 AND i.on_sale AND i.price = 0) OR (NOT $5 AND (i.price IS NULL OR i.price > 0))) \
         ORDER BY {order} LIMIT $6 OFFSET $7"
    )))
    .bind(cat)
    .bind(text.as_deref())
    .bind(text.as_deref().map(crate::identity::like_escape))
    .bind(creator)
    .bind(free)
    .bind(page.limit + 1)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = page.next_offset(offset, rows.len());
    rows.truncate(page.limit as usize);
    Ok(Json(PageBody { items: rows.iter().map(ItemRow::summary).collect(), next_cursor }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDetail {
    #[serde(flatten)]
    summary: ItemSummary,
    description: String,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    owned: Option<bool>,
}

/// `getCatalogItem`
pub async fn get_item(State(state): State<AppState>, MaybeViewer(viewer): MaybeViewer, IdPath(id): IdPath) -> ApiResult<Json<ItemDetail>> {
    let item: ItemRow = sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {ITEM_COLUMNS} FROM catalog.items i WHERE i.id = $1 AND i.status = 'active'")))
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(Problem::not_found)?;
    let owned = match &viewer {
        Some(v) => Some(
            sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM catalog.inventory WHERE user_id = $1 AND item_id = $2)")
                .bind(v.user_id)
                .bind(id)
                .fetch_one(&state.db)
                .await?,
        ),
        None => None,
    };
    Ok(Json(ItemDetail { summary: item.summary(), description: item.description.clone(), created_at: rfc3339(item.created_at), owned }))
}

#[derive(Deserialize)]
pub struct InventoryQuery {
    category: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    item: ItemSummary,
    acquired_at: String,
    source: String,
    serial: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct InvRow {
    #[sqlx(flatten)]
    item: ItemRow,
    inv_id: i64,
    acquired_at: OffsetDateTime,
    source: String,
    serial: Option<i32>,
}

/// `listInventory`: newest first, keyset-paginated.
pub async fn list_inventory(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<InventoryQuery>,
) -> ApiResult<Json<PageBody<InventoryItem>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let cat = category("category", q.category)?;
    let mut rows: Vec<InvRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ITEM_COLUMNS}, v.id AS inv_id, v.acquired_at, v.source, v.serial \
         FROM catalog.inventory v JOIN catalog.items i ON i.id = v.item_id \
         WHERE v.user_id = $1 AND ($2::text IS NULL OR i.category = $2) \
           AND ($3::timestamptz IS NULL OR (v.acquired_at, v.id) < ($3, $4)) \
         ORDER BY v.acquired_at DESC, v.id DESC LIMIT $5"
    )))
    .bind(viewer.user_id)
    .bind(cat)
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = if rows.len() as i64 > page.limit {
        rows.truncate(page.limit as usize);
        rows.last().map(|r| Cursor::key_for(r.acquired_at, r.inv_id).encode())
    } else {
        None
    };
    let items = rows
        .into_iter()
        .map(|r| InventoryItem { item: r.item.summary(), acquired_at: rfc3339(r.acquired_at), source: r.source, serial: r.serial })
        .collect();
    Ok(Json(PageBody { items, next_cursor }))
}

/// Adds one owned copy. Only [`crate::economy::grant_item`] calls this, inside its ledger transaction.
pub async fn insert_inventory(conn: &mut PgConnection, id: i64, user: i64, item: i64, source: &str) -> Result<(), sqlx::Error> {
    // Limited items take the next serial; the row lock on the item keeps serials unique.
    let serial: Option<Option<i32>> = sqlx::query_scalar(
        "UPDATE catalog.items SET limited_remaining = limited_remaining - 1, sales_count = sales_count + 1 \
         WHERE id = $1 AND (limited_remaining IS NULL OR limited_remaining > 0) \
         RETURNING CASE WHEN limited_supply IS NULL THEN NULL ELSE limited_supply - limited_remaining END",
    )
    .bind(item)
    .fetch_optional(&mut *conn)
    .await?;
    let Some(serial) = serial else {
        return Err(sqlx::Error::RowNotFound);
    };
    sqlx::query("INSERT INTO catalog.inventory (id, user_id, item_id, serial, source) VALUES ($1, $2, $3, $4, $5)")
        .bind(id)
        .bind(user)
        .bind(item)
        .bind(serial)
        .bind(source)
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn purge_user(conn: &mut PgConnection, user: i64) -> ApiResult<()> {
    for sql in [
        "DELETE FROM catalog.avatars WHERE user_id = $1",
        "DELETE FROM catalog.outfits WHERE user_id = $1",
        "DELETE FROM catalog.inventory WHERE user_id = $1",
    ] {
        sqlx::query(sql).bind(user).execute(&mut *conn).await?;
    }
    Ok(())
}

// ------------------------------------------------------------------ avatars

fn default_colors() -> Value {
    json!({ "head": "#C9CBD1", "torso": "#3A3D44", "arms": "#C9CBD1", "legs": "#2B2D33" })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Avatar {
    user_id: String,
    body_colors: Value,
    equipped: Vec<ItemSummary>,
    headshot_url: Option<String>,
    full_body_url: Option<String>,
    updated_at: String,
}

async fn avatar_body(db: impl PgExecutor<'_> + Copy, user: i64) -> ApiResult<Avatar> {
    let row: Option<(Value, Vec<i64>, Option<String>, Option<String>, OffsetDateTime)> = sqlx::query_as(
        "SELECT body_colors, equipped_inventory_ids, headshot_url, full_body_url, updated_at FROM catalog.avatars WHERE user_id = $1",
    )
    .bind(user)
    .fetch_optional(db)
    .await?;
    let (colors, inv_ids, headshot, full, updated) =
        row.unwrap_or_else(|| (default_colors(), Vec::new(), None, None, OffsetDateTime::now_utc()));
    // Only items still owned count as worn.
    let items: Vec<ItemRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ITEM_COLUMNS} FROM catalog.inventory v JOIN catalog.items i ON i.id = v.item_id \
         WHERE v.user_id = $1 AND v.id = ANY($2) ORDER BY array_position($2, v.id)"
    )))
    .bind(user)
    .bind(&inv_ids)
    .fetch_all(db)
    .await?;
    Ok(Avatar {
        user_id: user.to_string(),
        body_colors: colors,
        equipped: items.iter().take(20).map(ItemRow::summary).collect(),
        headshot_url: headshot,
        full_body_url: full,
        updated_at: rfc3339(updated),
    })
}

/// `getMyAvatar`
pub async fn get_my_avatar(State(state): State<AppState>, viewer: Viewer) -> ApiResult<Json<Avatar>> {
    Ok(Json(avatar_body(&state.db, viewer.user_id).await?))
}

/// `getUserAvatar`
pub async fn get_user_avatar(State(state): State<AppState>, MaybeViewer(viewer): MaybeViewer, IdPath(user): IdPath) -> ApiResult<Json<Avatar>> {
    crate::identity::basic(&state.db, user).await?.filter(|u| u.is_visible()).ok_or_else(Problem::not_found)?;
    if let Some(v) = &viewer
        && crate::social::blocks_between(&state.db, v.user_id, user).await?.1
    {
        return Err(Problem::not_found());
    }
    Ok(Json(avatar_body(&state.db, user).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvatarUpdate {
    body_colors: Option<Value>,
    equipped_item_ids: Option<Vec<String>>,
}

fn hex_color(v: Option<&Value>) -> bool {
    v.and_then(Value::as_str).is_some_and(|s| s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit()))
}

/// `setMyAvatar`: every item owned; one per slot except up to 5 accessories.
pub async fn set_my_avatar(State(state): State<AppState>, viewer: Viewer, ApiJson(body): ApiJson<AvatarUpdate>) -> ApiResult<Json<Avatar>> {
    let mut v = Validator::new();
    let colors = body.body_colors.unwrap_or(Value::Null);
    let parts = ["head", "torso", "arms", "legs"];
    if !colors.is_object() || parts.iter().any(|p| !hex_color(colors.get(*p))) {
        v.add("bodyColors", "invalid", "Give head, torso, arms and legs as #RRGGBB.");
    }
    let raw_ids = body.equipped_item_ids.unwrap_or_default();
    if raw_ids.len() > 20 {
        v.add("equippedItemIds", "too_many", "At most 20 items.");
    }
    let mut item_ids = Vec::new();
    for id in &raw_ids {
        match crate::ids::parse_id(id) {
            Some(i) if !item_ids.contains(&i) => item_ids.push(i),
            Some(_) => v.add("equippedItemIds", "duplicate", "Each item once."),
            None => v.add("equippedItemIds", "invalid", "Not an id."),
        }
    }
    v.finish()?;
    let colors = json!({ "head": colors["head"], "torso": colors["torso"], "arms": colors["arms"], "legs": colors["legs"] });

    // First owned copy of each item, with its category.
    let owned: Vec<(i64, i64, String)> = sqlx::query_as(
        "SELECT DISTINCT ON (v.item_id) v.item_id, v.id, i.category FROM catalog.inventory v JOIN catalog.items i ON i.id = v.item_id \
         WHERE v.user_id = $1 AND v.item_id = ANY($2) ORDER BY v.item_id, v.acquired_at",
    )
    .bind(viewer.user_id)
    .bind(&item_ids)
    .fetch_all(&state.db)
    .await?;
    let mut v = Validator::new();
    let mut inv_ids = Vec::new();
    let mut slots = HashSet::new();
    let mut accessories = 0;
    for item in &item_ids {
        let Some((_, inv, cat)) = owned.iter().find(|o| o.0 == *item) else {
            v.add("equippedItemIds", "not_owned", format!("You do not own item {item}."));
            continue;
        };
        if NOT_WEARABLE.contains(&cat.as_str()) {
            v.add("equippedItemIds", "not_wearable", format!("Item {item} cannot be worn."));
        } else if ACCESSORIES.contains(&cat.as_str()) {
            accessories += 1;
        } else if !slots.insert(cat.clone()) {
            v.add("equippedItemIds", "slot_taken", format!("Only one {cat} at a time."));
        }
        inv_ids.push(*inv);
    }
    if accessories > MAX_ACCESSORIES {
        v.add("equippedItemIds", "too_many_accessories", "Up to 5 accessories.");
    }
    v.finish()?;
    sqlx::query(
        "INSERT INTO catalog.avatars (user_id, body_colors, equipped_inventory_ids) VALUES ($1, $2, $3) \
         ON CONFLICT (user_id) DO UPDATE SET body_colors = EXCLUDED.body_colors, equipped_inventory_ids = EXCLUDED.equipped_inventory_ids, updated_at = now()",
    )
    .bind(viewer.user_id)
    .bind(&colors)
    .bind(&inv_ids)
    .execute(&state.db)
    .await?;
    Ok(Json(avatar_body(&state.db, viewer.user_id).await?))
}

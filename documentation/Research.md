# GamePile — Steam API Research

## 1. Data Source History

### 1.1 SteamSpy (Removed)

**SteamSpy** (`https://steamspy.com/api.php`) was the original fallback data source.

- Provided: name, developer, publisher, user-generated tags
- **Removed because:** no app type/platforms/release date/description, heavily rate-limited (1 req/sec), unreliable

### 1.2 Store `appdetails` Endpoint (Legacy)

**Endpoint:** `https://store.steampowered.com/api/appdetails?appids={id}&l=en`

- Public, unauthenticated
- Aggressively rate-limited (~200 req/5min)
- Returns `{ "success": false }` for region-locked, age-gated, delisted, and many valid apps
- **Replaced by IStoreBrowseService** which is more reliable and supports batching

### 1.3 SteamDB Scraping (Investigated, Not Viable)

- No maintained npm packages for SteamDB scraping
- Cloudflare protection returns HTTP 403 for automated requests
- Requires headful browser + manual CAPTCHA solving
- **SteamDB itself uses Valve's IStoreBrowseService/GetItems API** — so we use the same source directly

---

## 2. Primary Source: IStoreBrowseService/GetItems/v1

| Property        | Value                                                          |
|-----------------|----------------------------------------------------------------|
| **Endpoint**    | `https://api.steampowered.com/IStoreBrowseService/GetItems/v1` |
| **Method**      | GET                                                            |
| **Auth**        | `key` param (existing `STEAM_API_KEY`)                         |
| **Input**       | `input_json` URL param with JSON body                          |
| **Batching**    | Up to 50 app IDs per request                                   |
| **Reliability** | Returns data for apps where `appdetails` fails                 |

### 2.1 Request Format

```json
{
  "ids": [
    {
      "appid": 1086940
    },
    {
      "appid": 3244680
    }
  ],
  "data_request": {
    "include_basic_info": true,
    "include_release": true,
    "include_platforms": true,
    "include_tag_count": 20,
    "include_categories": true,
    "include_reviews": true,
    "include_assets": true,
    "include_full_description": true
  },
  "context": {
    "language": "english",
    "country_code": "US"
  }
}
```

### 2.2 Available `data_request` Flags

| Flag                           | Description                                           | Used |
|--------------------------------|-------------------------------------------------------|------|
| `include_basic_info`           | short_description, publishers, developers, franchises | ✅    |
| `include_release`              | steam_release_date, is_coming_soon, is_early_access   | ✅    |
| `include_platforms`            | windows, mac, steamos_linux, steam_deck_compat, vr    | ✅    |
| `include_tag_count`            | Integer — how many tags to return (max ~20)           | ✅    |
| `include_categories`           | Player, feature, and controller category IDs          | ✅    |
| `include_reviews`              | review_count, percent_positive, review_score, label   | ✅    |
| `include_assets`               | All image asset hashes + URL format template          | ✅    |
| `include_full_description`     | Full description in BBCode format                     | ✅    |
| `include_screenshots`          | Screenshot filenames + ordinal                        | ❌    |
| `include_trailers`             | Trailer names, CDN paths, formats                     | ❌    |
| `include_supported_languages`  | Language IDs with audio/subtitle flags                | ❌    |
| `include_ratings`              | ESRB/PEGI rating data                                 | ❌    |
| `include_links`                | Social media URLs                                     | ❌    |
| `include_all_purchase_options` | Pricing data                                          | ❌    |

> **Note:** The IStoreBrowseService API does **not** return genre data. Tags are used
> instead for game categorization and filtering, as they are more comprehensive,
> user-driven, and directly available from the API.

### 2.3 Type Mapping

| API `type` | GamePile `GameType` |
|------------|---------------------|
| 0          | GAME                |
| 1          | DLC                 |
| 2          | DEMO                |
| 4          | ADVERTISING         |
| 6          | MOD                 |

### 2.4 Asset URL Construction

Assets use a template: `steam/apps/{appid}/${FILENAME}?t={timestamp}`
Base CDN: `https://shared.akamai.steamstatic.com/store_item_assets/`
Full URL: `base + asset_url_format.replace("${FILENAME}", hash)`

### 2.5 Steam Deck Compat Categories

| Value | Meaning     |
|-------|-------------|
| 0     | Unknown     |
| 1     | Unsupported |
| 2     | Playable    |
| 3     | Verified    |

---

## 3. Supporting APIs

### 3.1 IStoreService/GetTagList/v1

Returns all Steam tags (~500) with `tagid` and `name`. Supports `version_hash` for caching.

### 3.2 IStoreBrowseService/GetStoreCategories/v1

Returns all store categories (~80) with `categoryid`, `type`, `internal_name`, `display_name`, `image_url`.

### 3.3 IStoreService/GetAppList/v1

Paginated app catalog. Supports `if_modified_since` for delta sync, `last_appid` cursor.

### 3.4 IPlayerService/GetOwnedGames/v1

User's owned games with playtime data.

---

## 4. Rate Limiting

With batch processing (50 apps/request), effective throughput:
`200 requests/5min × 50 apps = 10,000 apps/5min`

Entire Steam catalog (~180K apps) can be processed in ~90 minutes.

### 4.1 Cooldown

HTTP 429/403 triggers a 30-second cooldown (local or Redis-distributed). All `acquire()` calls block until expiry.

---

## 5. Batch Architecture

```
Parent Job → groups apps into batches of 50
           → enqueues N/50 child BullMQ jobs
           → each child calls fetchStoreBrowseDetailsBatch(appIds[])
           → 1 HTTP request per 50 games
```

50x reduction in API calls vs single-game approach.

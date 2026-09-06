-- A19: sport attribute schema v3 — nested groups + sibling-scoped keys + path-keyed profile storage.
--
-- Schema shape is validated in the application layer (SportAttributeSchemaValidator); JSONB gives
-- structural validity only. See documentation/md/SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md §5.
--
-- Both statements are scoped to Badminton — the only sport with a seeded schema (A15). Pickleball
-- and the other 10 sports carry a NULL attributes_schema and no profile attributes, so there is
-- nothing to migrate for them. Both statements are idempotent: re-running this changeset is a no-op.

-- 1. Rewrite the seeded Badminton document into clean v3 form: the A15 document with every "order"
--    key removed (v3 orders by array position). Badminton has no nesting to introduce, so the
--    structure is otherwise identical. Authoritative copy:
--    modules/sport/sport-impl/docs/MVP/A19_BADMINTON_SCHEMA_V3.json
UPDATE sports
SET attributes_schema = '{
  "defaultLocale": "en",
  "definitions": [
    {
      "name": "Reference",
      "fields": [
        { "key": "id", "label": { "en": "Item", "vi": "Sản phẩm" }, "type": "STRING", "isRequired": false },
        { "key": "value", "label": { "en": "Name", "vi": "Tên" }, "type": "STRING", "isRequired": true }
      ]
    },
    {
      "name": "ShoeSize",
      "fields": [
        {
          "key": "system", "label": { "en": "System", "vi": "Hệ" }, "type": "ENUM", "isRequired": true,
          "options": [
            { "value": "US", "label": { "en": "US", "vi": "US" } },
            { "value": "UK", "label": { "en": "UK", "vi": "UK" } },
            { "value": "EU", "label": { "en": "EU", "vi": "EU" } },
            { "value": "JP", "label": { "en": "JP", "vi": "JP" } }
          ]
        },
        { "key": "value", "label": { "en": "Size", "vi": "Cỡ" }, "type": "STRING", "isRequired": true }
      ]
    },
    {
      "name": "Shoe",
      "fields": [
        { "key": "shoe", "label": { "en": "Shoe", "vi": "Giày" }, "type": "DEFINITION", "definitionRef": "Reference", "isRequired": true },
        { "key": "size", "label": { "en": "Size", "vi": "Cỡ" }, "type": "DEFINITION", "definitionRef": "ShoeSize", "isRequired": false }
      ]
    }
  ],
  "groups": [
    {
      "key": "general",
      "label": { "en": "General", "vi": "Thông tin chung" },
      "isAvailable": true,
      "attributes": [
        {
          "key": "handedness", "label": { "en": "Hand", "vi": "Tay thuận" }, "type": "ENUM", "isAvailable": true,
          "options": [
            { "value": "LEFT", "label": { "en": "Left hand", "vi": "Tay trái" } },
            { "value": "RIGHT", "label": { "en": "Right hand", "vi": "Tay phải" } }
          ]
        },
        {
          "key": "playstyle", "label": { "en": "Playstyle", "vi": "Lối chơi" }, "type": "ENUM", "isAvailable": true,
          "defaultValue": "BALANCE",
          "options": [
            { "value": "ATTACK", "label": { "en": "Attack", "vi": "Tấn công" } },
            { "value": "BALANCE", "label": { "en": "Balance", "vi": "Cân bằng" } },
            { "value": "DEFENSE", "label": { "en": "Defense", "vi": "Phòng thủ" } }
          ]
        }
      ]
    },
    {
      "key": "gear",
      "label": { "en": "Gear", "vi": "Trang bị" },
      "isAvailable": true,
      "attributes": [
        { "key": "rackets", "label": { "en": "Rackets", "vi": "Vợt" }, "type": "DEFINITION_LIST", "definitionRef": "Reference", "searchScope": "equipment.racket.badminton", "isAvailable": true },
        { "key": "racketString", "label": { "en": "String", "vi": "Dây vợt" }, "type": "DEFINITION_LIST", "definitionRef": "Reference", "searchScope": "equipment.string.badminton", "isAvailable": true },
        { "key": "shuttlecocks", "label": { "en": "Shuttlecocks", "vi": "Quả cầu" }, "type": "DEFINITION_LIST", "definitionRef": "Reference", "searchScope": "equipment.shuttlecock", "isAvailable": true },
        { "key": "footwear", "label": { "en": "Footwear", "vi": "Giày" }, "type": "DEFINITION_LIST", "definitionRef": "Shoe", "searchScope": "equipment.shoe.court", "isAvailable": true }
      ]
    }
  ]
}'::jsonb
WHERE name = 'Badminton';

-- 2. Rekey any stored Badminton profile attributes from the pre-v3 bare leaf key to the v3 full
--    path. Row volume is ~zero pre-launch, but the statement exists and is covered. Skipped for any
--    row that already carries a '/'-bearing key (already migrated) — that guard is what makes a
--    re-run a no-op. An unrecognised key is left as-is; the next profile write prunes it.
UPDATE user_sport_profiles usp
SET attributes = (
    SELECT jsonb_object_agg(
        CASE kv.key
            WHEN 'handedness'   THEN 'general/handedness'
            WHEN 'playstyle'    THEN 'general/playstyle'
            WHEN 'rackets'      THEN 'gear/rackets'
            WHEN 'racketString' THEN 'gear/racketString'
            WHEN 'shuttlecocks' THEN 'gear/shuttlecocks'
            WHEN 'footwear'     THEN 'gear/footwear'
            ELSE kv.key
        END,
        kv.value
    )
    FROM jsonb_each(usp.attributes) AS kv
)
FROM sports s
WHERE usp.sport_id = s.id
  AND s.name = 'Badminton'
  AND usp.attributes IS NOT NULL
  AND usp.attributes <> '{}'::jsonb
  AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(usp.attributes) AS k WHERE k LIKE '%/%'
  );

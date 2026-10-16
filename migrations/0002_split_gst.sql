-- Only current settings change; historical order snapshots remain untouched.
UPDATE settings
SET value=json_remove(json_set(value,
  '$.cgstRate', coalesce(json_extract(value,'$.cgstRate'),2.5),
  '$.sgstRate', coalesce(json_extract(value,'$.sgstRate'),2.5)), '$.gstRate')
WHERE key='restaurant';

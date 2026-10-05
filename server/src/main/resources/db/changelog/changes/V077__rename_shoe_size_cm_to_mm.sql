-- U21: shoe size is stored in millimetres (JP size is the foot length: 265 mm, not 26.5 cm). The column was INTEGER
-- centimetres, which cannot hold half sizes. Rename and convert existing values once (Liquibase runs this a single
-- time). A legacy nonsense value (> 50 cm) becomes > 500 mm; it is left as is, since the 10-500 check applies only
-- when a profile is saved.
ALTER TABLE users RENAME COLUMN shoe_size_cm TO shoe_size_mm;
UPDATE users SET shoe_size_mm = shoe_size_mm * 10 WHERE shoe_size_mm IS NOT NULL;

-- Rollback for 008_checklist_items.sql. Destructive: every checklist item
-- is permanently lost. Never run automatically.

drop table if exists checklist_items;

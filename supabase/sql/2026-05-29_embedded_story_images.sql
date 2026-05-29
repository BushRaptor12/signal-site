alter table stories
  add column if not exists image_credit text,
  add column if not exists image_credit_url text;

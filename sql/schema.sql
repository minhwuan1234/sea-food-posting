-- Legacy JSONB snapshot remains as a read-only migration source.
CREATE TABLE IF NOT EXISTS app_state (
  id integer PRIMARY KEY,
  body jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  name text PRIMARY KEY,
  mime text NOT NULL,
  body bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  caption text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  position integer NOT NULL,
  UNIQUE (region_id, url)
);

CREATE TABLE IF NOT EXISTS product_images (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_name text NOT NULL REFERENCES images(name),
  position integer NOT NULL,
  PRIMARY KEY (product_id, position)
);

CREATE TABLE IF NOT EXISTS product_region_content (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, region_id)
);

CREATE TABLE IF NOT EXISTS product_region_images (
  product_id uuid NOT NULL,
  region_id uuid NOT NULL,
  image_name text NOT NULL REFERENCES images(name),
  position integer NOT NULL,
  PRIMARY KEY (product_id, region_id, position),
  FOREIGN KEY (product_id, region_id) REFERENCES product_region_content(product_id, region_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posting_runs (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  region_name text NOT NULL,
  caption text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  next_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS posting_run_images (
  run_id uuid NOT NULL REFERENCES posting_runs(id) ON DELETE CASCADE,
  image_name text NOT NULL REFERENCES images(name),
  position integer NOT NULL,
  PRIMARY KEY (run_id, position)
);

CREATE TABLE IF NOT EXISTS posting_run_groups (
  run_id uuid NOT NULL REFERENCES posting_runs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  group_name text NOT NULL,
  url text NOT NULL,
  status text NOT NULL,
  message text,
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (run_id, position)
);

CREATE INDEX IF NOT EXISTS groups_region_position_idx ON groups(region_id, position);
CREATE INDEX IF NOT EXISTS posting_runs_started_idx ON posting_runs(started_at DESC);

export const migrations: { name: string; sql: string }[] = [
  {
    name: "001_initial",
    sql: `
      DO $$ BEGIN CREATE TYPE platform_enum AS ENUM ('facebook','instagram','tiktok'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE post_status_enum AS ENUM ('draft','generating','pending_approval','approved','scheduled','posted','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE quality_tier_enum AS ENUM ('cheap','standard','premium'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE source_enum AS ENUM ('csv','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE asset_type_enum AS ENUM ('image','reel','story'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE generation_status_enum AS ENUM ('pending','generating','ready','failed','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE provider_enum AS ENUM ('gemini','fal-kling','fal-seedance','fal-veo','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE target_status_enum AS ENUM ('pending','posted','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE kb_kind_enum AS ENUM ('image','video'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS brands (
        id serial PRIMARY KEY,
        name text NOT NULL,
        style_instructions text,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS channels (
        id serial PRIMARY KEY,
        brand_id int REFERENCES brands(id) ON DELETE CASCADE,
        platform platform_enum NOT NULL,
        external_id text NOT NULL,
        access_token text NOT NULL,
        token_expires_at timestamptz,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        UNIQUE(brand_id, platform, external_id)
      );

      CREATE TABLE IF NOT EXISTS knowledge_base_assets (
        id serial PRIMARY KEY,
        brand_id int REFERENCES brands(id) ON DELETE CASCADE,
        kind kb_kind_enum NOT NULL,
        storage_key text NOT NULL,
        notes text,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS posts (
        id serial PRIMARY KEY,
        brand_id int REFERENCES brands(id) ON DELETE CASCADE,
        copy text NOT NULL,
        scheduled_at timestamptz,
        status post_status_enum DEFAULT 'draft',
        quality_tier quality_tier_enum DEFAULT 'standard',
        source source_enum DEFAULT 'manual',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS post_assets (
        id serial PRIMARY KEY,
        post_id int REFERENCES posts(id) ON DELETE CASCADE,
        asset_type asset_type_enum NOT NULL,
        generation_status generation_status_enum DEFAULT 'pending',
        storage_key text,
        prompt_used text,
        provider provider_enum,
        cost numeric(10,4),
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS post_targets (
        id serial PRIMARY KEY,
        post_id int REFERENCES posts(id) ON DELETE CASCADE,
        channel_id int REFERENCES channels(id) ON DELETE CASCADE,
        caption_override text,
        status target_status_enum DEFAULT 'pending',
        external_post_id text,
        posted_at timestamptz,
        error_message text,
        likes int,
        comments int,
        shares int,
        views int,
        reach int,
        last_synced_at timestamptz
      );

      CREATE TABLE IF NOT EXISTS settings (
        id int PRIMARY KEY DEFAULT 1,
        monthly_budget_cap numeric(10,2),
        current_spend numeric(10,2) DEFAULT 0,
        timezone text DEFAULT 'America/New_York',
        CONSTRAINT settings_single_row CHECK (id = 1)
      );

      INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: "002_asset_error_message",
    sql: `ALTER TABLE post_assets ADD COLUMN IF NOT EXISTS error_message text;`,
  },
  {
    name: "003_post_on_image_text",
    sql: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS on_image_text text;`,
  },
];

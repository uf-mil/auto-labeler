
-- Labeler DB schema (PostgreSQL)
-- Users, Projects, Images, Annotation Sets, Annotations
-- Notes:
-- - Uses enums for annotation type/state.
-- - JSONB payload for shape data keeps the schema flexible.
-- - Trigger updates image.last_annotated_* when a set is submitted.
-- - Consider enabling "citext" for case-insensitive emails (optional).

BEGIN;

-- Enums for annotations type/state
DO $$
BEGIN
  IF NOT EXISTS 
  (
    SELECT 1
    FROM pg_type
    WHERE typname = 'annotation_type'
  ) 
  THEN
    CREATE TYPE annotation_type AS ENUM (
        'bbox',
        'polygon',
        'keypoints'
    );
  END IF;

  IF NOT EXISTS
  (
    SELECT 1
    FROM pg_type
    WHERE typname = 'annotation_state'
  ) 
  THEN
    CREATE TYPE annotation_state AS ENUM
    (
        'unsubmitted',
        'submitted'
    );
  END IF;
END
$$;

-- Users
CREATE TABLE IF NOT EXISTS users
(
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL, -- Not storing plaintext
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Application users (unique email, hashed passwords).';
COMMENT ON COLUMN users.email IS 'Unique login email.';
COMMENT ON COLUMN users.password_hash IS 'Argon2 (or bcrypt/argon2id) password hash.';

-- Projects
CREATE TABLE IF NOT EXISTS projects
(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_user_id BIGINT 
                     NOT NULL
                     REFERENCES users(id)
                     ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS 'Logical grouping for images and labels.';


-- Label catalog 
CREATE TABLE IF NOT EXISTS labels (
  id BIGSERIAL PRIMARY KEY,
  project_id  BIGINT NOT NULL
              REFERENCES projects(id)
              ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  CONSTRAINT uq_labels_project_name UNIQUE (project_id, name)
);
COMMENT ON TABLE labels IS 'Per-project class names (e.g., car, person, etc.).';


-- Images
CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL 
               REFERENCES projects(id)
               ON DELETE CASCADE,
    uri TEXT NOT NULL,
    width INT,
    height INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    last_annotated_at TIMESTAMPTZ,
    last_annotated_by_user BIGINT REFERENCES users(id),

    CONSTRAINT chk_image_dims CHECK
    (
      (width  IS NULL OR width  > 0) AND
      (height IS NULL OR height > 0)
    )
);
COMMENT ON TABLE images IS 'Images to be labeled; tracks last submitted annotation info.';
CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_images_last_annoted ON images(last_annotated_at);

-- Sets of Annotations
CREATE TABLE IF NOT EXISTS annotation_sets (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL 
             REFERENCES images(id)
             ON DELETE CASCADE,
    author_user_id BIGINT NOT NULL 
                  REFERENCES users(id)
                  ON DELETE RESTRICT,

    state annotation_state NOT NULL DEFAULT 'unsubmitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    name TEXT,

    CONSTRAINT chk_set_submit_consistency CHECK 
    (
        (state = 'unsubmitted' AND submitted_at IS NULL)
        OR
        (state = 'submitted'   AND submitted_at IS NOT NULL)
    )
);
COMMENT ON TABLE annotation_sets IS 'Versioned/grouped annotations per image and author.';
CREATE INDEX IF NOT EXISTS idx_sets_image ON annotation_sets(image_id);
CREATE INDEX IF NOT EXISTS idx_sets_state ON annotation_sets(state);

-- At most ONE submitted set per (image, author).
CREATE UNIQUE INDEX IF NOT EXISTS uq_submitted_per_user_per_image
  ON annotation_sets (image_id, author_user_id)
  WHERE state = 'submitted';


-- Annotations (the actual shapes in a set)
CREATE TABLE IF NOT EXISTS annotations
(
  id BIGSERIAL PRIMARY KEY,
  set_id BIGINT NOT NULL
         REFERENCES annotation_sets(id)
         ON DELETE CASCADE,
  type annotation_type NOT NULL,
  label_id BIGINT
           REFERENCES labels(id)
           ON DELETE SET NULL,
  annotation_name  TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE annotations IS 'Shapes within a set (bbox/polygon/keypoints) stored as JSONB.';
COMMENT ON COLUMN annotations.data IS 'Payload examples: bbox:{x,y,w,h}; polygon:{points:[[x,y],...]}; keypoints:{points:[{name,x,y},...]}.';

CREATE INDEX IF NOT EXISTS idx_annotations_set   ON annotations(set_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label ON annotations(label_id);
CREATE INDEX IF NOT EXISTS idx_annotations_data  ON annotations USING GIN (data);


-- Trigger: when a set becomes SUBMITTED, stamp the image's last_annotated_* fields
CREATE OR REPLACE FUNCTION fn_update_image_last_annotation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = 'submitted' THEN
    UPDATE images
    SET
      last_annotated_at      = COALESCE(NEW.submitted_at, now()),
      last_annotated_by_user = NEW.author_user_id
    WHERE id = NEW.image_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_image_last ON annotation_sets;
CREATE TRIGGER trg_update_image_last
AFTER INSERT OR UPDATE OF state, submitted_at
ON annotation_sets
FOR EACH ROW
EXECUTE FUNCTION fn_update_image_last_annotation();

COMMIT;
